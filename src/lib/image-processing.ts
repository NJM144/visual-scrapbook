/**
 * Redimensionnement et compression des photos avant envoi.
 *
 * Un import depuis un téléphone porte facilement sur 200 clichés de 4 Mo. Les
 * envoyer bruts sur un forfait data, c'est près d'un giga-octet et un import qui
 * n'aboutit jamais. On ramène chaque image à une définition d'affichage avant
 * de la téléverser.
 */

/**
 * Définition d'envoi, selon la connexion.
 *
 * 2048 px plafonnaient la qualité d'impression : à peine 170 dpi sur un livre
 * 30×30, soit un rendu mou. 3200 px donnent 265 dpi au même format, largement
 * acceptable. Mais c'est aussi trois fois le poids — intenable sur une 3G
 * ivoirienne ou en mode économie de données, où l'on garde 2048.
 */
const MAX_DIMENSION_FAST = 3200;
const MAX_DIMENSION_SLOW = 2048;

interface NetworkInformation {
  effectiveType?: string;
  saveData?: boolean;
}

/** Plafond adapté à la connexion courante. */
export function uploadDimension(): number {
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  if (!connection) return MAX_DIMENSION_FAST;

  if (connection.saveData) return MAX_DIMENSION_SLOW;
  const type = connection.effectiveType ?? "";
  if (type === "slow-2g" || type === "2g" || type === "3g") return MAX_DIMENSION_SLOW;
  return MAX_DIMENSION_FAST;
}
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
    const { width, height } = scaledSize(bitmap.width, bitmap.height, uploadDimension());
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

/** Miniature stockée à côté de chaque photo : 640 px couvrent une grille de téléphone. */
const STORAGE_THUMBNAIL_DIMENSION = 640;
const STORAGE_THUMBNAIL_QUALITY = 0.72;

/** Miniature JPEG d'une image, pour le stockage. `null` si le décodage échoue. */
export async function createStorageThumbnail(source: Blob): Promise<Blob | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await decode(source);
  } catch {
    return null;
  }

  try {
    const { width, height } = scaledSize(bitmap.width, bitmap.height, STORAGE_THUMBNAIL_DIMENSION);
    return await toBlob(draw(bitmap, width, height), STORAGE_THUMBNAIL_QUALITY);
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
    bitmap = await decode(new File([await response.blob()], "photo"));
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
