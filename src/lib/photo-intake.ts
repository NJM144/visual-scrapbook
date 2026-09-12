/**
 * Accès aux workers d'examen des photos depuis le fil principal.
 *
 * Deux workers au plus : décoder deux photos de 12 Mpx à la fois tient dans la
 * mémoire d'un téléphone milieu de gamme, davantage non.
 */
import {
  emptyResult,
  HEIC_NAME,
  isHeic,
  type InspectRequest,
  type InspectResult,
} from "./photo-kind";

export type { InspectResult } from "./photo-kind";

/**
 * Photo acceptée à l'import. Chrome et Edge sous Windows donnent un type vide
 * aux HEIC : filtrer sur `image/*` seul les écartait sans prévenir.
 */
export function isPhotoFile(file: File): boolean {
  return file.type.startsWith("image/") || HEIC_NAME.test(file.name);
}

export function photoMime(blob: Blob, name: string): string {
  if (blob.type) return blob.type;
  if (isHeic(blob, name)) return /\.heif$/i.test(name) ? "image/heif" : "image/heic";
  return "image/jpeg";
}

export function photoExtension(blob: Blob, name: string): string {
  const mime = photoMime(blob, name);
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/heif") return "heif";
  if (mime === "image/heic") return "heic";
  return (name.split(".").pop() || "jpg").toLowerCase();
}

let pool: Worker[] | null = null;
let broken = false;
let turn = 0;
const waiting = new Map<string, (result: InspectResult) => void>();

function getPool(): Worker[] | null {
  if (broken || typeof Worker === "undefined") return null;
  if (pool) return pool;
  const size = Math.max(1, Math.min(2, (navigator.hardwareConcurrency || 2) - 1));
  try {
    pool = Array.from({ length: size }, () => {
      const worker = new Worker(new URL("./photo-inspect.worker.ts", import.meta.url), {
        type: "module",
      });
      worker.onmessage = (event: MessageEvent<InspectResult>) => {
        const resolve = waiting.get(event.data.id);
        if (resolve) {
          waiting.delete(event.data.id);
          resolve(event.data);
        }
      };
      // Un worker qui ne démarre pas (navigateur ancien) : on bascule tout le
      // travail en cours sur le fil principal plutôt que de le perdre.
      worker.onerror = () => {
        broken = true;
        pool = null;
      };
      return worker;
    });
  } catch {
    broken = true;
    pool = null;
  }
  return pool;
}

async function inspectHere(request: InspectRequest): Promise<InspectResult> {
  const { inspect } = await import("./photo-inspect");
  try {
    return await inspect(request);
  } catch {
    return emptyResult(request.id);
  }
}

export function inspectPhoto(file: File, full: boolean): Promise<InspectResult> {
  const request: InspectRequest = { id: crypto.randomUUID(), file, name: file.name, full };
  const workers = getPool();
  const worker = workers?.[turn++ % workers.length];
  if (!worker) return inspectHere(request);

  return new Promise((resolve) => {
    // Filet : si le worker meurt en route, la photo est réexaminée ici.
    const timer = setTimeout(() => {
      waiting.delete(request.id);
      void inspectHere(request).then(resolve);
    }, 90_000);
    waiting.set(request.id, (result) => {
      clearTimeout(timer);
      resolve(result);
    });
    worker.postMessage(request);
  });
}
