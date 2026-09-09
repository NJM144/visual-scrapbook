/**
 * Redimensionnement et compression des photos avant envoi.
 *
 * Un import depuis un téléphone porte facilement sur 200 clichés de 4 Mo. Les
 * envoyer bruts sur un forfait data, c'est près d'un giga-octet et un import qui
 * n'aboutit jamais. On ramène chaque image à une définition d'affichage avant
 * de la téléverser.
 */

const MAX_DIMENSION = 2048;
const JPEG_QUALITY = 0.82;
const THUMBNAIL_DIMENSION = 320;
const THUMBNAIL_QUALITY = 0.7;

export interface ProcessedImage {
  blob: Blob;
  /** Extension à utiliser pour le chemin de stockage. */
  extension: string;
  width: number;
  height: number;
}

/**
 * Décode le fichier en respectant l'orientation EXIF, faute de quoi les photos
 * prises en portrait arrivent couchées.
 */
async function decode(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Certains navigateurs ignorent l'option et lèvent : on retente sans.
    return await createImageBitmap(file);
  }
}

function scaledSize(width: number, height: number, max: number) {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };

  const ratio = max / longest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

function draw(bitmap: ImageBitmap, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas indisponible");

  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);
  return canvas;
}

/**
 * Prépare une photo pour l'envoi. En cas d'échec du décodage — format exotique,
 * mémoire insuffisante sur un vieil appareil — on renvoie le fichier d'origine
 * plutôt que de perdre la photo.
 */
export async function processForUpload(file: File): Promise<ProcessedImage> {
  const original: ProcessedImage = {
    blob: file,
    extension: file.name.split(".").pop()?.toLowerCase() || "jpg",
    width: 0,
    height: 0,
  };

  let bitmap: ImageBitmap;
  try {
    bitmap = await decode(file);
  } catch {
    return original;
  }

  try {
    const { width, height } = scaledSize(bitmap.width, bitmap.height, MAX_DIMENSION);
    const blob = await toBlob(draw(bitmap, width, height), JPEG_QUALITY);

    // Une photo déjà petite ou déjà bien compressée ne gagne rien à être
    // ré-encodée : on garde l'originale, de meilleure qualité.
    if (!blob || blob.size >= file.size) return original;

    return { blob, extension: "jpg", width, height };
  } catch {
    return original;
  } finally {
    bitmap.close();
  }
}

/**
 * Vignette pour l'aperçu avant import. On ne peut pas afficher 300 objets URL
 * de 4 Mo : le navigateur mobile s'effondre.
 */
export async function createThumbnail(file: File): Promise<string | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await decode(file);
  } catch {
    return null;
  }

  try {
    const { width, height } = scaledSize(bitmap.width, bitmap.height, THUMBNAIL_DIMENSION);
    const blob = await toBlob(draw(bitmap, width, height), THUMBNAIL_QUALITY);
    return blob ? URL.createObjectURL(blob) : null;
  } catch {
    return null;
  } finally {
    bitmap.close();
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
