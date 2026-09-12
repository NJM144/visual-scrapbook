/**
 * File d'envoi des photos, indépendante des pages.
 *
 * Chaque photo passe par trois étapes : examen (worker), enregistrement de sa
 * ligne en base, puis envoi du fichier d'impression. La ligne existe avant la
 * fin de l'envoi : la photo apparaît dans l'album — avec son aperçu local —
 * alors qu'elle monte encore. On peut changer de page, recharger ou perdre le
 * réseau : la file est gardée dans IndexedDB et reprend d'elle-même.
 *
 * Mesures qui l'ont motivée (11/09/2026) : un appel serveur par photo à 918 ms,
 * aucune reprise en cas d'échec (une photo sur sept perdue), et un import de
 * 100 photos à 30 min en Slow 4G qu'il fallait pouvoir laisser tourner.
 */
import { supabase } from "@/integrations/supabase/client";
import { inspectPhoto, photoExtension, photoMime, type InspectResult } from "@/lib/photo-intake";
import { DISPLAY_TRANSFORM, THUMB_TRANSFORM, VERSION_TTL_S } from "@/lib/photo-versions";

/** Au-delà, envoi reprenable (TUS) par tranches de 6 Mo, la taille qu'impose Supabase. */
const RESUMABLE_FROM_BYTES = 6 * 1024 * 1024;
const UPLOAD_CONCURRENCY = 3;
const INSPECT_CONCURRENCY = 2;
const INSERT_BATCH = 20;
const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000];
/** Chemins immuables (identifiant unique) : on peut garder le fichier un an en cache. */
const CACHE_CONTROL = "31536000";

export type UploadStage = "analyse" | "enregistrement" | "envoi" | "terminé" | "échec" | "doublon";

export interface UploadItem {
  photoId: string;
  albumId: string;
  userId: string;
  file: File;
  order: number;
  /** Date de repli quand l'EXIF n'en porte pas : celle choisie au tri de l'import. */
  fallbackTakenAt: string;
  stage: UploadStage;
  progress: number;
  attempts: number;
  rowCreated: boolean;
  path: string | null;
  previewUrl: string | null;
  meta: InspectResult | null;
  error: string | null;
  /** URL des versions, signées à la fin de l'envoi et rangées avec la photo. */
  versions: { thumb_url: string; display_url: string; urls_expire_at: string } | null;
}

export interface UploadSnapshot {
  items: UploadItem[];
  /** Photos à envoyer, doublons exclus. */
  total: number;
  done: number;
  failed: number;
  duplicates: number;
  active: boolean;
}

const EMPTY: UploadSnapshot = {
  items: [],
  total: 0,
  done: 0,
  failed: 0,
  duplicates: 0,
  active: false,
};

const items = new Map<string, UploadItem>();
const listeners = new Set<() => void>();
const albumHashes = new Map<string, Set<string>>();
const running = new Set<string>();
let inspecting = 0;
let uploading = 0;
let snapshot: UploadSnapshot = EMPTY;
let emitTimer: ReturnType<typeof setTimeout> | null = null;

let hooks: {
  onRowsCreated?: (albumId: string) => void;
  onUploaded?: (albumId: string) => void;
} = {};

export function setUploadHooks(next: typeof hooks) {
  hooks = next;
}

export function subscribeUploads(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getUploadSnapshot = () => snapshot;
export const getServerUploadSnapshot = () => EMPTY;

const isActive = (stage: UploadStage) =>
  stage === "analyse" || stage === "enregistrement" || stage === "envoi";

function emit() {
  if (emitTimer) {
    clearTimeout(emitTimer);
    emitTimer = null;
  }
  const list = [...items.values()];
  snapshot = {
    items: list,
    total: list.filter((item) => item.stage !== "doublon").length,
    done: list.filter((item) => item.stage === "terminé").length,
    failed: list.filter((item) => item.stage === "échec").length,
    duplicates: list.filter((item) => item.stage === "doublon").length,
    active: list.some((item) => isActive(item.stage)),
  };
  for (const listener of listeners) listener();
  if (!snapshot.active) scheduleCleanup();
}

/** Les événements de progression arrivent par dizaines : on les regroupe. */
function emitSoon() {
  emitTimer ??= setTimeout(emit, 150);
}

function patch(item: UploadItem, changes: Partial<UploadItem>) {
  Object.assign(item, changes);
  emit();
}

let cleanupTimer: ReturnType<typeof setTimeout> | null = null;
/** Une fois tout envoyé, le bilan reste affiché quelques secondes puis disparaît. */
function scheduleCleanup() {
  if (cleanupTimer || items.size === 0) return;
  cleanupTimer = setTimeout(() => {
    cleanupTimer = null;
    if ([...items.values()].some((item) => isActive(item.stage) || item.stage === "échec")) return;
    for (const item of items.values()) if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    items.clear();
    emit();
  }, 12_000);
}

/* -------------------------------------------------------------- IndexedDB */

interface StoredItem {
  photoId: string;
  albumId: string;
  userId: string;
  file: File;
  order: number;
  fallbackTakenAt: string;
  rowCreated: boolean;
  path: string | null;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  dbPromise ??= new Promise((resolve) => {
    try {
      const request = indexedDB.open("anthologie-envois", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("items", { keyPath: "photoId" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function store(action: (objects: IDBObjectStore) => IDBRequest | void): Promise<unknown> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction("items", "readwrite");
      const request = action(tx.objectStore("items"));
      tx.oncomplete = () => resolve(request ? request.result : null);
      tx.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
    } catch {
      // Quota dépassé, navigation privée : la file continue en mémoire.
      resolve(null);
    }
  });
}

function persist(item: UploadItem) {
  const record: StoredItem = {
    photoId: item.photoId,
    albumId: item.albumId,
    userId: item.userId,
    file: item.file,
    order: item.order,
    fallbackTakenAt: item.fallbackTakenAt,
    rowCreated: item.rowCreated,
    path: item.path,
  };
  void store((objects) => objects.put(record));
}

function forget(photoId: string) {
  void store((objects) => objects.delete(photoId));
}

let resumed = false;

/** Reprend les envois interrompus (onglet fermé, téléphone éteint, réseau perdu). */
export async function resumeUploads(userId: string) {
  if (resumed) return;
  resumed = true;
  const records = ((await store((objects) => objects.getAll())) ?? []) as StoredItem[];
  let count = 0;
  for (const record of records) {
    if (record.userId !== userId || items.has(record.photoId)) continue;
    items.set(record.photoId, {
      ...record,
      // Réexaminée dans tous les cas : l'aperçu et une éventuelle conversion
      // HEIC ne sont pas gardés, ils se recalculent.
      stage: "analyse",
      progress: 0,
      attempts: 0,
      previewUrl: null,
      meta: null,
      error: null,
      versions: null,
    });
    count += 1;
  }
  if (count > 0) {
    emit();
    pump();
  }
}

/* ---------------------------------------------------------------- entrée */

export function enqueuePhotos(input: {
  albumId: string;
  userId: string;
  files: { file: File; takenAt?: Date | null }[];
  startOrder: number;
  /** Empreintes déjà présentes dans l'album : ces photos ne seront pas renvoyées. */
  knownHashes?: Iterable<string>;
}): number {
  const hashes = albumHashes.get(input.albumId) ?? new Set<string>();
  for (const hash of input.knownHashes ?? []) hashes.add(hash);
  albumHashes.set(input.albumId, hashes);

  input.files.forEach(({ file, takenAt }, index) => {
    const item: UploadItem = {
      photoId: crypto.randomUUID(),
      albumId: input.albumId,
      userId: input.userId,
      file,
      order: input.startOrder + index,
      fallbackTakenAt: (takenAt ?? new Date(file.lastModified || Date.now())).toISOString(),
      stage: "analyse",
      progress: 0,
      attempts: 0,
      rowCreated: false,
      path: null,
      previewUrl: null,
      meta: null,
      error: null,
      versions: null,
    };
    items.set(item.photoId, item);
    persist(item);
  });
  emit();
  pump();
  return input.files.length;
}

export function retryUpload(photoId: string) {
  const item = items.get(photoId);
  if (!item || item.stage !== "échec") return;
  patch(item, { stage: "analyse", attempts: 0, error: null, progress: 0 });
  if (item.rowCreated) {
    void supabase.from("photos").update({ upload_status: "uploading" }).eq("id", item.photoId);
  }
  pump();
}

/** Retire une photo de la file (supprimée par l'utilisateur pendant l'envoi). */
export function dropUpload(photoId: string) {
  const item = items.get(photoId);
  if (!item) return;
  if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  items.delete(photoId);
  forget(photoId);
  emit();
}

/* ---------------------------------------------------------------- moteur */

function pump() {
  for (const item of items.values()) {
    if (inspecting >= INSPECT_CONCURRENCY) break;
    if (item.stage !== "analyse" || running.has(item.photoId)) continue;
    running.add(item.photoId);
    inspecting += 1;
    void runInspect(item).finally(() => {
      inspecting -= 1;
      running.delete(item.photoId);
      pump();
    });
  }
  for (const item of items.values()) {
    if (uploading >= UPLOAD_CONCURRENCY) break;
    if (item.stage !== "envoi" || !item.rowCreated || running.has(item.photoId)) continue;
    running.add(item.photoId);
    uploading += 1;
    void runUpload(item).finally(() => {
      uploading -= 1;
      running.delete(item.photoId);
      pump();
    });
  }
}

async function runInspect(item: UploadItem) {
  const meta = await inspectPhoto(item.file, true);
  const blob = meta.print ?? item.file;
  const previewUrl = meta.preview ? URL.createObjectURL(meta.preview) : null;

  // Reprise : la ligne existe déjà, son chemin est fixé.
  if (item.rowCreated && item.path) {
    patch(item, { meta, previewUrl, stage: "envoi" });
    return;
  }

  const hashes = albumHashes.get(item.albumId) ?? new Set<string>();
  if (meta.hash && hashes.has(meta.hash)) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    patch(item, { meta, stage: "doublon" });
    forget(item.photoId);
    return;
  }
  if (meta.hash) hashes.add(meta.hash);
  albumHashes.set(item.albumId, hashes);

  const path =
    item.userId +
    "/" +
    item.albumId +
    "/" +
    item.photoId +
    "." +
    photoExtension(blob, item.file.name);
  patch(item, { meta, previewUrl, path, stage: "enregistrement" });
  persist(item);
  queueInsert(item);
}

/* Enregistrement des lignes, par lots, directement dans Supabase (RLS). */

const insertBuffer = new Set<string>();
let insertTimer: ReturnType<typeof setTimeout> | null = null;
let insertAttempts = 0;

function queueInsert(item: UploadItem) {
  insertBuffer.add(item.photoId);
  if (insertBuffer.size >= INSERT_BATCH) void flushInserts();
  else insertTimer ??= setTimeout(() => void flushInserts(), 300);
}

async function flushInserts() {
  if (insertTimer) {
    clearTimeout(insertTimer);
    insertTimer = null;
  }
  const batch = [...insertBuffer]
    .map((id) => items.get(id))
    .filter((item): item is UploadItem => Boolean(item && item.path));
  insertBuffer.clear();
  if (batch.length === 0) return;

  const rows = batch.map((item) => {
    const meta = item.meta;
    const blob = meta?.print ?? item.file;
    return {
      id: item.photoId,
      album_id: item.albumId,
      user_id: item.userId,
      storage_path: item.path as string,
      print_path: item.path,
      url: "",
      order_index: item.order,
      taken_at: meta?.takenAt ?? item.fallbackTakenAt,
      latitude: meta?.latitude ?? null,
      longitude: meta?.longitude ?? null,
      width: meta?.width ?? null,
      height: meta?.height ?? null,
      aspect_ratio:
        meta?.width && meta.height ? Number((meta.width / meta.height).toFixed(4)) : null,
      dominant_color: meta?.dominantColor ?? null,
      file_hash: meta?.hash ?? null,
      file_size: blob.size,
      mime_type: photoMime(blob, item.file.name),
      upload_status: "uploading",
    };
  });

  // « ON CONFLICT DO NOTHING » : après une coupure, renvoyer le lot est sans risque.
  const { error } = await supabase
    .from("photos")
    .upsert(rows, { onConflict: "id", ignoreDuplicates: true });

  if (error) {
    insertAttempts += 1;
    const delay = RETRY_DELAYS_MS[Math.min(insertAttempts, RETRY_DELAYS_MS.length) - 1] ?? 60_000;
    if (insertAttempts > RETRY_DELAYS_MS.length) {
      for (const item of batch) patch(item, { stage: "échec", error: error.message });
      insertAttempts = 0;
      return;
    }
    for (const item of batch) insertBuffer.add(item.photoId);
    insertTimer = setTimeout(() => void flushInserts(), delay);
    return;
  }

  insertAttempts = 0;
  const albums = new Set<string>();
  for (const item of batch) {
    albums.add(item.albumId);
    patch(item, { rowCreated: true, stage: "envoi" });
    persist(item);
  }
  for (const albumId of albums) hooks.onRowsCreated?.(albumId);
  pump();
}

/* Envoi du fichier d'impression, direct navigateur → Supabase Storage. */

const doneBuffer = new Set<string>();
let doneTimer: ReturnType<typeof setTimeout> | null = null;

function markDone(item: UploadItem) {
  doneBuffer.add(item.photoId);
  doneTimer ??= setTimeout(() => void flushDone(), 500);
}

async function flushDone() {
  doneTimer = null;
  const ids = [...doneBuffer];
  doneBuffer.clear();
  if (ids.length === 0) return;

  const batch = ids
    .map((id) => items.get(id))
    .filter((item): item is UploadItem => Boolean(item?.path));

  // Les URL des versions accompagnent le passage à « envoyée » : l'album n'a
  // plus rien à signer à sa première ouverture (9 s économisées sur 60 photos).
  const rows = batch.map((item) => ({
    id: item.photoId,
    album_id: item.albumId,
    user_id: item.userId,
    storage_path: item.path as string,
    url: "",
    upload_status: "done",
    ...(item.versions ?? {}),
  }));

  const { error } = await supabase.from("photos").upsert(rows, { onConflict: "id" });
  if (error) {
    for (const id of ids) doneBuffer.add(id);
    doneTimer = setTimeout(() => void flushDone(), 5_000);
    return;
  }
  const albums = new Set(batch.map((item) => item.albumId));
  for (const albumId of albums) hooks.onUploaded?.(albumId);
}

/**
 * Signe la vignette et la version d'affichage juste après l'envoi. Deux
 * allers-retours de plus par photo, mais l'album s'ouvre sans attendre.
 */
async function signVersions(path: string) {
  try {
    const bucket = supabase.storage.from("photos");
    const [thumb, display] = await Promise.all([
      bucket.createSignedUrl(path, VERSION_TTL_S, { transform: THUMB_TRANSFORM }),
      bucket.createSignedUrl(path, VERSION_TTL_S, { transform: DISPLAY_TRANSFORM }),
    ]);
    if (!thumb.data?.signedUrl || !display.data?.signedUrl) return null;
    return {
      thumb_url: thumb.data.signedUrl,
      display_url: display.data.signedUrl,
      urls_expire_at: new Date(Date.now() + VERSION_TTL_S * 1000).toISOString(),
    };
  } catch {
    // Le serveur signera à la première ouverture de l'album.
    return null;
  }
}

function waitForNetwork(delay: number) {
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      if (typeof navigator === "undefined" || navigator.onLine) return resolve();
      window.addEventListener("online", () => resolve(), { once: true });
    }, delay);
  });
}

const alreadyStored = (message: string) => /exists|duplicate/i.test(message);

async function uploadResumable(item: UploadItem, blob: Blob, mime: string) {
  const { Upload } = await import("tus-js-client");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Session expirée, reconnectez-vous.");

  const url = import.meta.env["VITE_SUPABASE_URL"] as string;
  const key = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string;

  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(blob, {
      endpoint: url + "/storage/v1/upload/resumable",
      retryDelays: [0, 3_000, 5_000, 10_000, 20_000],
      headers: { authorization: "Bearer " + token, apikey: key, "x-upsert": "false" },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: RESUMABLE_FROM_BYTES,
      metadata: {
        bucketName: "photos",
        objectName: item.path as string,
        contentType: mime,
        cacheControl: CACHE_CONTROL,
      },
      onProgress: (sent, total) => {
        item.progress = total ? sent / total : 0;
        emitSoon();
      },
      onSuccess: () => resolve(),
      onError: (error) => {
        const status = (
          error as { originalResponse?: { getStatus: () => number } }
        ).originalResponse?.getStatus();
        if (status === 409) resolve();
        else reject(error);
      },
    });
    void upload.findPreviousUploads().then((previous) => {
      if (previous[0]) upload.resumeFromPreviousUpload(previous[0]);
      upload.start();
    });
  });
}

async function runUpload(item: UploadItem) {
  const blob = item.meta?.print ?? item.file;
  const mime = photoMime(blob, item.file.name);

  try {
    if (blob.size > RESUMABLE_FROM_BYTES) {
      await uploadResumable(item, blob, mime);
    } else {
      const { error } = await supabase.storage.from("photos").upload(item.path as string, blob, {
        contentType: mime,
        cacheControl: CACHE_CONTROL,
        upsert: false,
      });
      if (error && !alreadyStored(error.message)) throw error;
    }
    const versions = await signVersions(item.path as string);
    patch(item, { progress: 1, stage: "terminé", error: null, versions });
    forget(item.photoId);
    markDone(item);
  } catch (error) {
    const attempts = item.attempts + 1;
    const message = error instanceof Error ? error.message : String(error);
    if (attempts > RETRY_DELAYS_MS.length) {
      patch(item, { attempts, stage: "échec", error: message });
      void supabase.from("photos").update({ upload_status: "failed" }).eq("id", item.photoId);
      return;
    }
    patch(item, { attempts, error: message });
    await waitForNetwork(RETRY_DELAYS_MS[attempts - 1] ?? 60_000);
  }
}
