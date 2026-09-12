/**
 * Petites images calculées dans le navigateur : aperçus du tri avant import et
 * vignette envoyée au modèle de vision.
 *
 * Les photos elles-mêmes ne sont plus réduites avant l'envoi : le fichier
 * d'impression est l'original intact (photo-inspect.ts, upload-queue.ts).
 */

const THUMBNAIL_DIMENSION = 320;
const THUMBNAIL_QUALITY = 0.7;

/**
 * Décode en respectant l'orientation EXIF, faute de quoi les photos prises en
 * portrait arrivent couchées.
 */
async function decode(source: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(source, { imageOrientation: "from-image" });
  } catch {
    // Certains navigateurs ignorent l'option et lèvent : on retente sans.
    return await createImageBitmap(source);
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

/** Côté maximal de la vignette envoyée au modèle de vision. */
const AI_THUMBNAIL_DIMENSION = 512;
const AI_THUMBNAIL_QUALITY = 0.72;

/**
 * Vignette encodée en base64 pour l'analyse par le modèle de vision.
 *
 * 512 px suffisent à décrire une scène et à y situer un sujet. Envoyer
 * l'originale multiplierait par vingt le poids des requêtes sans rien apporter
 * au modèle.
 */
export async function createAiThumbnail(
  url: string,
): Promise<{ base64: string; mimeType: string } | null> {
  let bitmap: ImageBitmap;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    bitmap = await decode(await response.blob());
  } catch {
    return null;
  }

  try {
    const { width, height } = scaledSize(bitmap.width, bitmap.height, AI_THUMBNAIL_DIMENSION);
    const blob = await toBlob(draw(bitmap, width, height), AI_THUMBNAIL_QUALITY);
    if (!blob) return null;

    const buffer = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    // Par tranches : passer un tableau de 500 000 octets à String.fromCharCode
    // dépasse la limite d'arguments de la pile.
    const chunk = 0x8000;
    for (let i = 0; i < buffer.length; i += chunk) {
      binary += String.fromCharCode(...buffer.subarray(i, i + chunk));
    }

    return { base64: btoa(binary), mimeType: "image/jpeg" };
  } catch {
    return null;
  } finally {
    bitmap.close();
  }
}
