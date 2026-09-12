// Rattrapage des photos existantes : dimensions, couleur dominante, empreinte,
// poids, type et chemin d'impression.
//
// Remplace la création des miniatures « à la première visite », qui rendait
// justement cette visite interminable (78,7 s avant la première vignette,
// mesure du 11/09/2026). Les vignettes et versions d'affichage n'ont plus
// besoin de rattrapage : elles sont servies par transformation. Il ne reste
// que les métadonnées, calculées ici une fois pour toutes.
//
// Par lots de 50, reprenable (état dans scripts/.backfill-state.json), journal
// dans scripts/backfill.log. Ne touche qu'aux colonnes vides.
//
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/backfill-photo-metadata.mjs [--dry-run]
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { imageSize } from "image-size";
import crypto from "node:crypto";
import fs from "node:fs";

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.");
  process.exit(1);
}

const DRY_RUN = process.argv.includes("--dry-run");
const BATCH = 50;
const CONCURRENCY = 4;
const STATE = "scripts/.backfill-state.json";
const LOG = "scripts/backfill.log";

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : { lastId: null, done: 0, failed: 0 };
const log = (line) => fs.appendFileSync(LOG, new Date().toISOString() + " " + line + "\n");

const MIME = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", heif: "image/heif", heic: "image/heic", gif: "image/gif" };

/**
 * Couleur moyenne, et au passage la preuve que le fichier se décode vraiment.
 *
 * Un envoi interrompu laisse un en-tête valide mais un contenu tronqué : les
 * dimensions se lisent encore, l'image non. Trouvé sur 34 photos envoyées par
 * l'ancien chemin, sans reprise (11/09/2026).
 */
async function inspectPixels(path, buffer) {
  try {
    const { data } = await sharp(buffer).resize(8, 8, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    return { color: average(data), readable: true };
  } catch {
    // HEIC : sharp ne le décode pas, on passe par une transformation Supabase.
    try {
      const { data: signed } = await supabase.storage.from("photos").createSignedUrl(path, 120, {
        transform: { width: 16, height: 16, resize: "contain", quality: 60 },
      });
      if (!signed?.signedUrl) return { color: null, readable: false };
      const response = await fetch(signed.signedUrl);
      if (!response.ok) return { color: null, readable: false };
      const small = Buffer.from(await response.arrayBuffer());
      const { data } = await sharp(small).resize(8, 8, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      return { color: average(data), readable: true };
    } catch {
      return { color: null, readable: false };
    }
  }
}

function average(data) {
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < data.length; i += 3) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  const n = data.length / 3;
  const hex = (v) => Math.round(v / n).toString(16).padStart(2, "0");
  return "#" + hex(r) + hex(g) + hex(b);
}

/** Signe la vignette et la version d'affichage, et les range avec la photo. */
async function signVersions(path) {
  const ttl = 30 * 24 * 60 * 60;
  const [thumb, display] = await Promise.all([
    supabase.storage.from("photos").createSignedUrl(path, ttl, {
      transform: { width: 400, height: 400, resize: "contain", quality: 70 },
    }),
    supabase.storage.from("photos").createSignedUrl(path, ttl, {
      transform: { width: 1400, height: 1400, resize: "contain", quality: 65 },
    }),
  ]);
  if (!thumb.data?.signedUrl || !display.data?.signedUrl) return null;
  return {
    thumb_url: thumb.data.signedUrl,
    display_url: display.data.signedUrl,
    urls_expire_at: new Date(Date.now() + ttl * 1000).toISOString(),
  };
}

async function processPhoto(photo) {
  const path = photo.print_path ?? photo.storage_path;

  // Métadonnées déjà complètes : il ne manque que les URL des versions. On ne
  // retélécharge pas l'original pour rien.
  if (photo.file_hash && photo.width && photo.height) {
    const versions = await signVersions(path);
    const patch = { print_path: path, ...(versions ?? {}) };
    if (!DRY_RUN) {
      const { error } = await supabase.from("photos").update(patch).eq("id", photo.id);
      if (error) throw new Error("mise à jour : " + error.message);
    }
    return { ...patch, width: photo.width, height: photo.height, dominant_color: photo.dominant_color, upload_status: photo.upload_status };
  }
  const { data: blob, error } = await supabase.storage.from("photos").download(path);
  if (error || !blob) throw new Error("téléchargement : " + (error?.message ?? "vide"));
  const buffer = Buffer.from(await blob.arrayBuffer());

  const size = imageSize(buffer);
  let width = size.width ?? null;
  let height = size.height ?? null;
  if (width && height && size.orientation && size.orientation >= 5) [width, height] = [height, width];

  const pixels = await inspectPixels(path, buffer);
  const patch = {
    print_path: path,
    width: photo.width ?? width,
    height: photo.height ?? height,
    aspect_ratio: photo.aspect_ratio ?? (width && height ? Number((width / height).toFixed(4)) : null),
    dominant_color: photo.dominant_color ?? pixels.color,
    file_hash: crypto.createHash("sha256").update(buffer).digest("hex"),
    file_size: buffer.length,
    mime_type: photo.mime_type ?? MIME[size.type] ?? "image/jpeg",
    // Fichier tronqué : on le marque au lieu de le laisser casser le livre.
    // L'album le signalera, et l'export l'ignorera.
    upload_status: pixels.readable ? "done" : "failed",
  };

  // URL des versions posées ici aussi : l'album n'aura rien à signer à sa
  // première ouverture. Une photo illisible n'en a pas.
  if (pixels.readable) Object.assign(patch, (await signVersions(path)) ?? {});
  if (!DRY_RUN) {
    const { error: updateError } = await supabase.from("photos").update(patch).eq("id", photo.id);
    if (updateError) throw new Error("mise à jour : " + updateError.message);
  }
  return patch;
}

async function run() {
  log("début" + (DRY_RUN ? " (essai à blanc)" : "") + ", reprise après " + (state.lastId ?? "le début"));
  for (;;) {
    // Il manque l'empreinte (premier passage) ou les URL des versions.
    let query = supabase
      .from("photos")
      .select(
        "id, storage_path, print_path, width, height, aspect_ratio, dominant_color, mime_type, file_hash, upload_status",
      )
      .or("file_hash.is.null,thumb_url.is.null")
      .neq("upload_status", "uploading")
      .order("id", { ascending: true })
      .limit(BATCH);
    if (state.lastId) query = query.gt("id", state.lastId);
    const { data: photos, error } = await query;
    if (error) throw error;
    if (!photos || photos.length === 0) break;

    let cursor = 0;
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        while (cursor < photos.length) {
          const photo = photos[cursor++];
          try {
            const patch = await processPhoto(photo);
            state.done += 1;
            if (patch.upload_status === "failed") state.unreadable = (state.unreadable ?? 0) + 1;
            log(
              (patch.upload_status === "failed" ? "illisible " : "ok ") +
                photo.id +
                " " +
                patch.width +
                "×" +
                patch.height +
                " " +
                patch.dominant_color,
            );
          } catch (e) {
            state.failed += 1;
            log("échec " + photo.id + " " + e.message);
          }
        }
      }),
    );

    state.lastId = photos[photos.length - 1].id;
    fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
    console.log(state.done + " traitées, " + state.failed + " échecs");
  }
  log("fin : " + state.done + " traitées, " + state.failed + " échecs");
  console.log("Terminé : " + state.done + " traitées, " + state.failed + " échecs. Journal : " + LOG);
}

run().catch((e) => {
  log("arrêt : " + e.message);
  console.error(e);
  process.exit(1);
});
