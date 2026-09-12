import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type {
  AdminAlbumRow,
  Album,
  AlbumPreview,
  GridPhoto,
  PhotoPage,
  PhotoWithSignedUrl,
} from "./albums";
import { isAlbumLayout } from "./book-layout";
import { thumbPath } from "./photo-paths";
import {
  DISPLAY_TRANSFORM,
  RENEW_BEFORE_MS,
  THUMB_TRANSFORM,
  VERSION_TTL_S,
} from "./photo-versions";

type Client = SupabaseClient<Database>;

/** Les transformations plafonnent vers 3 000 px : repli d'impression pour un HEIC seulement. */
const HEIC_PRINT_TRANSFORM = { width: 2500, height: 2500, resize: "contain", quality: 92 } as const;
const PRINT_TTL_S = 6 * 60 * 60;

interface VersionRow {
  id: string;
  storage_path: string;
  print_path?: string | null;
  upload_status?: string | null;
  thumb_url?: string | null;
  display_url?: string | null;
  urls_expire_at?: string | null;
}

async function mapLimit<T, R>(list: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(list.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, list.length) }, async () => {
      while (cursor < list.length) {
        const index = cursor;
        cursor += 1;
        out[index] = await fn(list[index] as T);
      }
    }),
  );
  return out;
}

/**
 * URL de la vignette et de la version d'affichage de chaque photo.
 *
 * Réutilise celles gardées en base tant qu'il leur reste plus de 7 jours, et
 * ne signe que les autres — une signature par version, le lot de signatures
 * de Supabase ignorant les transformations (vérifié). Le cas courant ne signe
 * donc rien : la file d'envoi enregistre les URL dès la fin de l'envoi, et le
 * script de rattrapage les a posées sur les photos plus anciennes. Une photo
 * encore en cours d'envoi n'a pas de fichier : elle n'a pas encore d'URL.
 */
async function withVersionUrls<T extends VersionRow>(
  supabase: Client,
  rows: T[],
  canPersist: (row: T) => boolean,
): Promise<(T & { thumbUrl: string | null; displayUrl: string | null })[]> {
  const now = Date.now();
  const stale = rows.filter(
    (row) =>
      row.upload_status !== "uploading" &&
      !(
        row.thumb_url &&
        row.display_url &&
        row.urls_expire_at &&
        Date.parse(row.urls_expire_at) - now > RENEW_BEFORE_MS
      ),
  );

  const bucket = supabase.storage.from("photos");
  const fresh = new Map<string, { thumb: string | null; display: string | null }>();
  await mapLimit(stale, 12, async (row) => {
    const path = row.print_path ?? row.storage_path;
    const [thumb, display] = await Promise.all([
      bucket.createSignedUrl(path, VERSION_TTL_S, { transform: THUMB_TRANSFORM }),
      bucket.createSignedUrl(path, VERSION_TTL_S, { transform: DISPLAY_TRANSFORM }),
    ]);
    fresh.set(row.id, {
      thumb: thumb.data?.signedUrl ?? null,
      display: display.data?.signedUrl ?? null,
    });
  });

  const expires = new Date(now + VERSION_TTL_S * 1000).toISOString();
  await mapLimit(
    stale.filter((row) => canPersist(row)),
    12,
    async (row) => {
      const urls = fresh.get(row.id);
      if (!urls?.thumb || !urls.display) return;
      // Un échec ici ne gêne pas l'affichage : on resignera à la prochaine visite.
      await supabase
        .from("photos")
        .update({ thumb_url: urls.thumb, display_url: urls.display, urls_expire_at: expires })
        .eq("id", row.id);
    },
  );

  return rows.map((row) => {
    const urls = fresh.get(row.id);
    return {
      ...row,
      thumbUrl: urls ? urls.thumb : (row.thumb_url ?? null),
      displayUrl: urls ? urls.display : (row.display_url ?? null),
    };
  });
}

async function isAdminUser(supabase: Client, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return Boolean(data);
}

const isHeicPhoto = (photo: {
  storage_path: string;
  print_path?: string | null;
  mime_type?: string | null;
}) =>
  /hei[cf]/i.test(photo.mime_type ?? "") ||
  /\.(heic|heif)$/i.test(photo.print_path ?? photo.storage_path);

/**
 * Fichiers d'impression signés pour l'export. Les HEIC, que le navigateur de
 * l'administrateur ne sait pas décoder, passent par une transformation au
 * plafond de Supabase : l'indicateur de définition de la fiche technique le
 * signalera.
 */
async function signPrintFiles(
  supabase: Client,
  photos: {
    id: string;
    storage_path: string;
    print_path?: string | null;
    mime_type?: string | null;
  }[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const bucket = supabase.storage.from("photos");
  const plain = photos.filter((photo) => !isHeicPhoto(photo));
  const heic = photos.filter(isHeicPhoto);

  if (plain.length > 0) {
    const pathOf = (photo: (typeof plain)[number]) => photo.print_path ?? photo.storage_path;
    const { data } = await bucket.createSignedUrls(plain.map(pathOf), PRINT_TTL_S);
    const byPath = new Map<string, string>();
    for (const entry of data ?? []) {
      if (entry.path && entry.signedUrl && !entry.error) byPath.set(entry.path, entry.signedUrl);
    }
    for (const photo of plain) {
      const url = byPath.get(pathOf(photo));
      if (url) out.set(photo.id, url);
    }
  }

  await mapLimit(heic, 8, async (photo) => {
    const { data } = await bucket.createSignedUrl(
      photo.print_path ?? photo.storage_path,
      PRINT_TTL_S,
      {
        transform: HEIC_PRINT_TRANSFORM,
      },
    );
    if (data?.signedUrl) out.set(photo.id, data.signedUrl);
  });
  return out;
}

/**
 * `albums.layout` est du JSON libre côté base. On le valide au passage plutôt
 * que de le forcer : une disposition corrompue doit faire retomber l'album sur
 * le découpage automatique, pas casser l'affichage.
 */
function toAlbum(row: Record<string, unknown>): Album {
  const layout = row["layout"];
  return {
    ...(row as unknown as Album),
    layout: isAlbumLayout(layout) ? layout : null,
  };
}

export const getAlbums = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Album[]> => {
    const { data, error } = await context.supabase
      .from("albums")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data ?? []).map(toAlbum);
  });

export const getAlbum = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ albumId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }): Promise<Album> => {
    const { data: album, error } = await context.supabase
      .from("albums")
      .select("*")
      .eq("id", data.albumId)
      .eq("user_id", context.userId)
      .single();

    if (error || !album) throw new Error("Album introuvable");
    return toAlbum(album);
  });

export const createAlbum = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        title: z.string().min(1).max(120),
        description: z.string().max(500).optional(),
        // Coffret et thème, choisis avant les photos. Absents, la base pose
        // ses valeurs par défaut.
        theme: z.string().min(1).max(40).optional(),
        pageFormat: z.string().min(1).max(40).optional(),
        coverTemplate: z.string().min(1).max(40).optional(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }): Promise<Album> => {
    const { data: album, error } = await context.supabase
      .from("albums")
      .insert({
        user_id: context.userId,
        title: data.title,
        description: data.description ?? null,
        ...(data.theme ? { theme: data.theme } : {}),
        ...(data.pageFormat ? { page_format: data.pageFormat } : {}),
        ...(data.coverTemplate ? { cover_template: data.coverTemplate } : {}),
      })
      .select()
      .single();

    if (error) throw error;
    return toAlbum(album);
  });

/** Colonnes utiles à la grille ; les autres restent en base. */
const GRID_COLUMNS =
  "id, storage_path, print_path, caption, order_index, created_at, taken_at, width, height, aspect_ratio, dominant_color, upload_status, thumb_url, display_url, urls_expire_at";

/**
 * Une page de la grille d'un album. Les photos s'enregistrent désormais
 * depuis le navigateur (file d'envoi) : il n'y a plus de fonction serveur par
 * photo, qui coûtait 918 ms chacune depuis Washington.
 */
export const getPhotosPage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        albumId: z.string().uuid(),
        offset: z.number().int().min(0),
        limit: z.number().int().min(1).max(120),
      })
      .parse(data),
  )
  .handler(async ({ context, data }): Promise<PhotoPage> => {
    const {
      data: rows,
      error,
      count,
    } = await context.supabase
      .from("photos")
      .select(GRID_COLUMNS, data.offset === 0 ? { count: "exact" } : {})
      .eq("album_id", data.albumId)
      .eq("user_id", context.userId)
      .order("order_index", { ascending: true })
      .order("created_at", { ascending: true })
      .range(data.offset, data.offset + data.limit - 1);

    if (error) throw error;
    const list = rows ?? [];
    const photos = await withVersionUrls(context.supabase, list, () => true);

    return {
      photos: photos.map((photo): GridPhoto => ({
        id: photo.id,
        storage_path: photo.storage_path,
        caption: photo.caption,
        order_index: photo.order_index,
        taken_at: photo.taken_at,
        width: photo.width,
        height: photo.height,
        aspect_ratio: photo.aspect_ratio,
        dominant_color: photo.dominant_color,
        upload_status: photo.upload_status,
        thumbUrl: photo.thumbUrl,
        displayUrl: photo.displayUrl,
      })),
      total: count ?? null,
      nextOffset: list.length === data.limit ? data.offset + data.limit : null,
    };
  });

export const deletePhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        photoId: z.string().uuid(),
        storagePath: z.string().min(1),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const { error: dbError } = await context.supabase
      .from("photos")
      .delete()
      .eq("id", data.photoId)
      .eq("user_id", context.userId);

    if (dbError) throw dbError;

    const { error: storageError } = await context.supabase.storage
      .from("photos")
      .remove([data.storagePath, thumbPath(data.storagePath)]);

    if (storageError) throw storageError;

    return { success: true };
  });

export const deleteAlbum = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ albumId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    // Storage objects are deleted by cascade trigger? Supabase doesn't cascade
    // storage on album delete, so we clean up photos first.
    const { data: photos, error: photosError } = await context.supabase
      .from("photos")
      .select("storage_path")
      .eq("album_id", data.albumId)
      .eq("user_id", context.userId);

    if (photosError) throw photosError;

    if (photos && photos.length > 0) {
      const { error: storageError } = await context.supabase.storage
        .from("photos")
        .remove(photos.flatMap((p) => [p.storage_path, thumbPath(p.storage_path)]));
      if (storageError) throw storageError;
    }

    const { error } = await context.supabase
      .from("albums")
      .delete()
      .eq("id", data.albumId)
      .eq("user_id", context.userId);

    if (error) throw error;
    return { success: true };
  });

/**
 * Bibliothèque : les albums accompagnés de leur nombre de photos et d'une
 * vignette de couverture.
 *
 * `albums.cover_image` n'est pas exploitable ici — le bucket `photos` est privé,
 * une URL brute n'y donne pas accès. On signe donc la première photo de chaque
 * album. Tout est résolu en deux requêtes plutôt qu'une par album.
 */
export const getAlbumsWithPreview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AlbumPreview[]> => {
    const { data: albums, error } = await context.supabase
      .from("albums")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    if (!albums || albums.length === 0) return [];

    // Compté en base : lire toutes les photos pour les compter butait sur le
    // plafond de 1 000 lignes de PostgREST.
    const { data: stats, error: statsError } = await context.supabase.rpc("album_photo_stats");
    if (statsError) throw statsError;
    const statsByAlbum = new Map((stats ?? []).map((row) => [row.album_id, row]));

    const coverIds = (stats ?? [])
      .map((row) => row.cover_photo_id)
      .filter((id): id is string => Boolean(id));
    let covers: {
      id: string;
      album_id: string;
      storage_path: string;
      print_path: string | null;
      upload_status: string;
      thumb_url: string | null;
      display_url: string | null;
      urls_expire_at: string | null;
    }[] = [];
    if (coverIds.length > 0) {
      const { data, error: coversError } = await context.supabase
        .from("photos")
        .select(
          "id, album_id, storage_path, print_path, upload_status, thumb_url, display_url, urls_expire_at",
        )
        .in("id", coverIds);
      if (coversError) throw coversError;
      covers = data ?? [];
    }

    // La vignette suffit à une couverture de bibliothèque.
    const signed = await withVersionUrls(context.supabase, covers, () => true);
    const coverByAlbum = new Map(signed.map((cover) => [cover.album_id, cover.thumbUrl]));

    return albums.map((album) => ({
      ...toAlbum(album),
      photo_count: Number(statsByAlbum.get(album.id)?.photo_count ?? 0),
      cover_url: coverByAlbum.get(album.id) ?? null,
    }));
  });

/* ------------------------------------------------------- livre imprimable */

/** Enregistre les réglages d'impression : thème, format, textes de couverture. */
export const updateAlbumBook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        albumId: z.string().uuid(),
        theme: z.string().min(1).max(40),
        pageFormat: z.string().min(1).max(40),
        coverTemplate: z.string().min(1).max(40),
        coverTitle: z.string().max(120).nullable().optional(),
        coverSubtitle: z.string().max(160).nullable().optional(),
        coverPhotoId: z.string().uuid().nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }): Promise<Album> => {
    const { data: album, error } = await context.supabase
      .from("albums")
      .update({
        theme: data.theme,
        page_format: data.pageFormat,
        cover_template: data.coverTemplate,
        cover_title: data.coverTitle ?? null,
        cover_subtitle: data.coverSubtitle ?? null,
        cover_photo_id: data.coverPhotoId ?? null,
      })
      .eq("id", data.albumId)
      .eq("user_id", context.userId)
      .select()
      .single();

    if (error) throw error;
    return toAlbum(album);
  });

/** Le compte courant a-t-il le rôle administrateur ? */
export const getIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<boolean> => {
    const { data, error } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();

    if (error) return false;
    return Boolean(data);
  });

/**
 * Album destiné à l'export, sans filtrer sur le propriétaire.
 *
 * Le filtrage est laissé à la RLS, qui autorise le propriétaire *ou* un
 * administrateur. Refiltrer ici sur user_id empêcherait justement l'admin de
 * préparer les fichiers d'un client.
 */
export const getAlbumForExport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ albumId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }): Promise<Album> => {
    const { data: album, error } = await context.supabase
      .from("albums")
      .select("*")
      .eq("id", data.albumId)
      .single();

    if (error || !album) throw new Error("Album introuvable");
    return toAlbum(album);
  });

/** Colonnes dont le studio du livre a besoin. */
const STUDIO_COLUMNS =
  "id, album_id, user_id, storage_path, print_path, url, caption, order_index, created_at, crop_x, crop_y, crop_zoom, fit, aspect_ratio, taken_at, latitude, longitude, place, people, mood, face_count, width, height, dominant_color, upload_status, mime_type, file_hash, thumb_url, display_url, urls_expire_at";

/** Photos d'un album pour le studio et l'export, avec URL signées. Même règle RLS. */
export const getPhotosForExport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ albumId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }): Promise<PhotoWithSignedUrl[]> => {
    const { data: photos, error } = await context.supabase
      .from("photos")
      .select(STUDIO_COLUMNS)
      .eq("album_id", data.albumId)
      .eq("upload_status", "done")
      .order("order_index", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) throw error;
    if (!photos || photos.length === 0) return [];

    // L'administrateur consulte l'album d'un client : il ne peut pas écrire
    // dans ses lignes, on n'y garde donc pas les URL signées.
    const withUrls = await withVersionUrls(
      context.supabase,
      photos,
      (row) => row.user_id === context.userId,
    );
    // Le fichier d'impression n'est signé que pour l'administration, qui
    // prépare l'export : l'interface du client ne le charge jamais.
    const printUrls = (await isAdminUser(context.supabase, context.userId))
      ? await signPrintFiles(context.supabase, photos)
      : new Map<string, string>();

    return withUrls.map((photo) => ({
      ...photo,
      signedUrl: photo.displayUrl ?? "",
      thumbUrl: photo.thumbUrl,
      printUrl: printUrls.get(photo.id) ?? null,
    }));
  });

/** Tous les albums, tous comptes confondus. Réservé à l'administrateur. */
export const getAllAlbumsForAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminAlbumRow[]> => {
    const { data: isAdmin } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();

    if (!isAdmin) throw new Error("Accès réservé aux administrateurs.");

    const { data: albums, error } = await context.supabase
      .from("albums")
      .select("id, user_id, title, created_at, theme, page_format")
      .order("created_at", { ascending: false });

    if (error) throw error;
    if (!albums || albums.length === 0) return [];

    const { data: photos } = await context.supabase.from("photos").select("album_id");

    const counts = new Map<string, number>();
    for (const photo of photos ?? []) {
      counts.set(photo.album_id, (counts.get(photo.album_id) ?? 0) + 1);
    }

    return albums.map((album) => ({ ...album, photo_count: counts.get(album.id) ?? 0 }));
  });

/** Légende d'une photo, imprimée sous l'image dans le livre. */
export const updatePhotoCaption = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        photoId: z.string().uuid(),
        caption: z.string().max(300).nullable(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("photos")
      .update({ caption: data.caption?.trim() || null })
      .eq("id", data.photoId)
      .eq("user_id", context.userId);

    if (error) throw error;
    return { success: true };
  });

/**
 * Réordonne les photos d'un album.
 *
 * On reçoit la liste complète des identifiants dans l'ordre voulu et on
 * réécrit chaque order_index. Envoyer seulement les positions déplacées
 * laisserait des rangs en double dès qu'une photo est insérée entre deux
 * autres.
 */
export const reorderPhotos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        albumId: z.string().uuid(),
        photoIds: z.array(z.string().uuid()).min(1).max(500),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    for (let index = 0; index < data.photoIds.length; index += 1) {
      const photoId = data.photoIds[index];
      if (!photoId) continue;

      const { error } = await context.supabase
        .from("photos")
        .update({ order_index: index })
        .eq("id", photoId)
        .eq("album_id", data.albumId)
        .eq("user_id", context.userId);

      if (error) throw error;
    }
    return { success: true };
  });

/** Cadrage d'une photo : point focal, zoom, mode de remplissage. */
export const updatePhotoFraming = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        photoId: z.string().uuid(),
        cropX: z.number().min(0).max(1),
        cropY: z.number().min(0).max(1),
        cropZoom: z.number().min(1).max(4),
        fit: z.enum(["cover", "contain"]),
        aspectRatio: z.number().positive().max(100).optional(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const base = {
      crop_x: data.cropX,
      crop_y: data.cropY,
      crop_zoom: data.cropZoom,
      fit: data.fit,
    };
    // Mesuré à l'analyse : on ne l'écrase pas quand il n'est pas fourni.
    const patch =
      data.aspectRatio === undefined ? base : { ...base, aspect_ratio: data.aspectRatio };

    const { error } = await context.supabase
      .from("photos")
      .update(patch)
      .eq("id", data.photoId)
      .eq("user_id", context.userId);

    if (error) throw error;
    return { success: true };
  });

/** Enregistre les rapports d'aspect mesurés, pour composer les pages. */
export const saveAspectRatios = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        entries: z
          .array(
            z.object({ photoId: z.string().uuid(), aspectRatio: z.number().positive().max(100) }),
          )
          .min(1)
          .max(500),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    for (const entry of data.entries) {
      const { error } = await context.supabase
        .from("photos")
        .update({ aspect_ratio: entry.aspectRatio })
        .eq("id", entry.photoId)
        .eq("user_id", context.userId);

      if (error) throw error;
    }
    return { success: true };
  });

/** Disposition manuelle des pages. `null` rend la main au découpage automatique. */
export const updateAlbumLayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        albumId: z.string().uuid(),
        layout: z
          .object({
            pages: z
              .array(
                z.object({
                  id: z.string().min(1).max(64),
                  slots: z.array(z.string().uuid().nullable()).min(1).max(4),
                }),
              )
              .max(300),
          })
          .nullable(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("albums")
      .update({ layout: data.layout })
      .eq("id", data.albumId)
      .eq("user_id", context.userId);

    if (error) throw error;
    return { success: true };
  });

/**
 * Informations éditoriales d'une photo : ambiance, lieu, personnes.
 *
 * Les noms sont saisis par l'auteur. L'application ne fait aucune
 * reconnaissance faciale : elle compte les visages et demande qui c'est.
 */
export const updatePhotoMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        photoId: z.string().uuid(),
        mood: z.string().max(200).nullable().optional(),
        place: z.string().max(160).nullable().optional(),
        people: z.array(z.string().min(1).max(80)).max(30).optional(),
        faceCount: z.number().int().min(0).max(100).optional(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const patch: {
      mood?: string | null;
      place?: string | null;
      people?: string[];
      face_count?: number;
    } = {};
    if (data.mood !== undefined) patch.mood = data.mood?.trim() || null;
    if (data.place !== undefined) patch.place = data.place?.trim() || null;
    if (data.people !== undefined) patch.people = data.people.map((name) => name.trim());
    if (data.faceCount !== undefined) patch.face_count = data.faceCount;

    if (Object.keys(patch).length === 0) return { success: true };

    const { error } = await context.supabase
      .from("photos")
      .update(patch)
      .eq("id", data.photoId)
      .eq("user_id", context.userId);

    if (error) throw error;
    return { success: true };
  });
