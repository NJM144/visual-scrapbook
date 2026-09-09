/**
 * Lecture des métadonnées EXIF d'une image, côté navigateur.
 *
 * On n'analyse que l'en-tête du fichier (quelques dizaines de Ko) : inutile de
 * charger 5 Mo en mémoire pour lire une date, surtout quand l'utilisateur
 * importe 300 photos depuis son téléphone.
 */

const TAG_DATETIME = 0x0132; // DateTime (IFD0)
const TAG_EXIF_IFD_POINTER = 0x8769;
const TAG_DATETIME_ORIGINAL = 0x9003; // prise de vue
const TAG_DATETIME_DIGITIZED = 0x9004; // numérisation

/** Taille d'en-tête suffisante pour couvrir le segment APP1 d'un JPEG. */
const HEADER_BYTES = 256 * 1024;

export type DateSource = "exif" | "file";

/** Convertit "2025:08:12 17:04:31" (format EXIF) en Date locale. */
function parseExifDate(value: string): Date | null {
  const match = value.trim().match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );

  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Parcourt une IFD TIFF et renvoie la première date trouvée parmi `wanted`,
 * en suivant au besoin le pointeur vers l'IFD Exif.
 */
function readIfd(
  view: DataView,
  tiffStart: number,
  ifdOffset: number,
  little: boolean,
  wanted: number[],
  depth = 0,
): string | null {
  if (depth > 2) return null;
  const ifdStart = tiffStart + ifdOffset;
  if (ifdStart + 2 > view.byteLength) return null;

  const entryCount = view.getUint16(ifdStart, little);
  let exifPointer: number | null = null;

  for (let i = 0; i < entryCount; i += 1) {
    const entry = ifdStart + 2 + i * 12;
    if (entry + 12 > view.byteLength) break;

    const tag = view.getUint16(entry, little);
    const count = view.getUint32(entry + 4, little);

    if (tag === TAG_EXIF_IFD_POINTER) {
      exifPointer = view.getUint32(entry + 8, little);
      continue;
    }

    if (!wanted.includes(tag)) continue;

    // Les dates EXIF sont des chaînes ASCII de 20 octets, donc toujours
    // stockées hors de l'entrée (qui n'en contient que 4).
    const valueOffset = tiffStart + view.getUint32(entry + 8, little);
    if (valueOffset + count > view.byteLength) continue;

    let text = "";
    for (let c = 0; c < count; c += 1) {
      const code = view.getUint8(valueOffset + c);
      if (code === 0) break;
      text += String.fromCharCode(code);
    }
    if (text) return text;
  }

  if (exifPointer !== null) {
    return readIfd(view, tiffStart, exifPointer, little, wanted, depth + 1);
  }

  return null;
}

/** Extrait la date de prise de vue d'un JPEG. `null` si absente ou illisible. */
export async function readExifDate(file: File): Promise<Date | null> {
  try {
    const header = await file.slice(0, HEADER_BYTES).arrayBuffer();
    const view = new DataView(header);

    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null; // pas un JPEG

    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      if (view.getUint8(offset) !== 0xff) break;

      const marker = view.getUint8(offset + 1);
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      if (marker === 0xda) break; // début des données image : plus d'EXIF après

      const segmentLength = view.getUint16(offset + 2);
      if (segmentLength < 2) break;

      if (marker === 0xe1) {
        const app1 = offset + 4;
        // Signature "Exif\0\0"
        if (
          app1 + 6 <= view.byteLength &&
          view.getUint32(app1) === 0x45786966 &&
          view.getUint16(app1 + 4) === 0x0000
        ) {
          const tiffStart = app1 + 6;
          if (tiffStart + 8 > view.byteLength) return null;

          const byteOrder = view.getUint16(tiffStart);
          if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) return null;
          const little = byteOrder === 0x4949;

          const raw = readIfd(view, tiffStart, view.getUint32(tiffStart + 4, little), little, [
            TAG_DATETIME_ORIGINAL,
            TAG_DATETIME_DIGITIZED,
            TAG_DATETIME,
          ]);

          return raw ? parseExifDate(raw) : null;
        }
      }

      offset += 2 + segmentLength;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Date de prise de vue avec repli : EXIF si disponible, sinon la date de
 * modification du fichier — que les galeries Android et iOS renseignent
 * correctement dans la très grande majorité des cas.
 */
export async function resolvePhotoDate(file: File): Promise<{ takenAt: Date; source: DateSource }> {
  const exifDate = await readExifDate(file);
  if (exifDate) return { takenAt: exifDate, source: "exif" };

  const fallback = new Date(file.lastModified || Date.now());
  return { takenAt: fallback, source: "file" };
}
