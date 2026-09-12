/**
 * Examen d'une photo avant son envoi : date et position EXIF, dimensions,
 * empreinte, aperçu, couleur dominante.
 *
 * Tourne dans un Web Worker (photo-inspect.worker.ts) : la compression faite
 * sur le fil principal bloquait l'écran 18,5 s pour 100 photos (mesure du
 * 11/09/2026). Le même code sert de repli sur le fil principal si le worker
 * ne démarre pas.
 */
import exifr from "exifr";
import { emptyResult, isHeic, type InspectRequest, type InspectResult } from "./photo-kind";

export type { InspectRequest, InspectResult } from "./photo-kind";

const PREVIEW_SIDE = 400;
const PRINT_QUALITY = 0.92;

interface ExifTags {
  DateTimeOriginal?: Date | string;
  CreateDate?: Date | string;
  ModifyDate?: Date | string;
  ExifImageWidth?: number;
  ExifImageHeight?: number;
  ImageWidth?: number;
  ImageHeight?: number;
  Orientation?: number;
  latitude?: number;
  longitude?: number;
}

function toIso(value: Date | string | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Lecture partielle : exifr ne lit que les segments de métadonnées, pas l'image. */
async function readTags(file: Blob) {
  try {
    const tags = (await exifr.parse(file, {
      tiff: true,
      exif: true,
      gps: true,
      ifd1: false,
      interop: false,
      xmp: false,
      icc: false,
      iptc: false,
      jfif: false,
      ihdr: false,
      translateValues: false,
      reviveValues: true,
      mergeOutput: true,
    })) as ExifTags | undefined;
    if (!tags) return null;

    let width = tags.ExifImageWidth ?? tags.ImageWidth ?? null;
    let height = tags.ExifImageHeight ?? tags.ImageHeight ?? null;
    // Orientations 5 à 8 : la photo est tournée d'un quart de tour à l'affichage.
    if (width && height && tags.Orientation && tags.Orientation >= 5)
      [width, height] = [height, width];

    const lat = typeof tags.latitude === "number" ? tags.latitude : null;
    const lon = typeof tags.longitude === "number" ? tags.longitude : null;
    return {
      takenAt: toIso(tags.DateTimeOriginal ?? tags.CreateDate ?? tags.ModifyDate),
      latitude: lat !== null && lon !== null && (lat !== 0 || lon !== 0) ? lat : null,
      longitude: lat !== null && lon !== null && (lat !== 0 || lon !== 0) ? lon : null,
      width,
      height,
    };
  } catch {
    return null;
  }
}

async function decode(file: Blob): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    try {
      return await createImageBitmap(file);
    } catch {
      return null;
    }
  }
}

function paint(bitmap: ImageBitmap, width: number, height: number) {
  if (typeof OffscreenCanvas === "undefined") return null;
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);
  return { canvas, context };
}

function averageColor(bitmap: ImageBitmap): string | null {
  const tiny = paint(bitmap, 8, 8);
  if (!tiny) return null;
  const data = tiny.context.getImageData(0, 0, 8, 8).data;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i] ?? 0;
    g += data[i + 1] ?? 0;
    b += data[i + 2] ?? 0;
  }
  const n = data.length / 4;
  const hex = (v: number) =>
    Math.round(v / n)
      .toString(16)
      .padStart(2, "0");
  return "#" + hex(r) + hex(g) + hex(b);
}

function toHex(buffer: ArrayBuffer): string {
  let out = "";
  for (const byte of new Uint8Array(buffer)) out += byte.toString(16).padStart(2, "0");
  return out;
}

export async function inspect(request: InspectRequest): Promise<InspectResult> {
  const result = emptyResult(request.id);
  const tags = await readTags(request.file);
  if (tags) Object.assign(result, tags);
  if (!request.full) return result;

  result.hash = toHex(await crypto.subtle.digest("SHA-256", await request.file.arrayBuffer()));

  const bitmap = await decode(request.file);
  if (!bitmap) return result; // HEIC sur Chrome : les dimensions EXIF suffiront.

  try {
    result.width = bitmap.width;
    result.height = bitmap.height;
    result.dominantColor = averageColor(bitmap);

    const scale = Math.min(1, PREVIEW_SIDE / Math.max(bitmap.width, bitmap.height));
    const preview = paint(
      bitmap,
      Math.max(1, Math.round(bitmap.width * scale)),
      Math.max(1, Math.round(bitmap.height * scale)),
    );
    if (preview)
      result.preview = await preview.canvas.convertToBlob({ type: "image/jpeg", quality: 0.75 });

    if (isHeic(request.file, request.name)) {
      const full = paint(bitmap, bitmap.width, bitmap.height);
      if (full)
        result.print = await full.canvas.convertToBlob({
          type: "image/jpeg",
          quality: PRINT_QUALITY,
        });
    }
  } finally {
    bitmap.close();
  }
  return result;
}
