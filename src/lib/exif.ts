/**
 * Lecture des métadonnées EXIF d'une image, côté navigateur.
 *
 * On n'analyse que l'en-tête du fichier (quelques dizaines de Ko) : inutile de
 * charger 5 Mo en mémoire pour lire une date, surtout quand l'utilisateur
 * importe 300 photos depuis son téléphone.
 */

const TAG_DATETIME = 0x0132; // DateTime (IFD0)
const TAG_EXIF_IFD_POINTER = 0x8769;
const TAG_GPS_IFD_POINTER = 0x8825;
const TAG_DATETIME_ORIGINAL = 0x9003; // prise de vue
const TAG_DATETIME_DIGITIZED = 0x9004; // numérisation

const GPS_LATITUDE_REF = 0x0001;
const GPS_LATITUDE = 0x0002;
const GPS_LONGITUDE_REF = 0x0003;
const GPS_LONGITUDE = 0x0004;

/** Types EXIF utiles. */
const TYPE_ASCII = 2;
const TYPE_RATIONAL = 5;

/** Taille d'en-tête suffisante pour couvrir le segment APP1 d'un JPEG. */
const HEADER_BYTES = 256 * 1024;

export type DateSource = "exif" | "file";

export interface ExifMetadata {
  takenAt: Date | null;
  latitude: number | null;
  longitude: number | null;
}

interface Entry {
  type: number;
  count: number;
  /** Décalage absolu de la valeur dans le DataView. */
  offset: number;
}

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

const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

/**
 * Indexe une IFD : tag → emplacement de sa valeur.
 *
 * Une entrée fait 12 octets et ne contient la valeur elle-même que si celle-ci
 * tient sur 4 octets ; au-delà, les 4 octets portent un décalage. D'où le calcul
 * de `offset` ci-dessous, qui masque cette subtilité au reste du module.
 */
function readIfd(view: DataView, tiffStart: number, ifdOffset: number, little: boolean) {
  const entries = new Map<number, Entry>();
  const ifdStart = tiffStart + ifdOffset;
  if (ifdStart + 2 > view.byteLength) return entries;

  const count = view.getUint16(ifdStart, little);
  for (let i = 0; i < count; i += 1) {
    const entry = ifdStart + 2 + i * 12;
    if (entry + 12 > view.byteLength) break;

    const tag = view.getUint16(entry, little);
    const type = view.getUint16(entry + 2, little);
    const length = view.getUint32(entry + 4, little);
    const size = (TYPE_SIZE[type] ?? 1) * length;

    const offset = size <= 4 ? entry + 8 : tiffStart + view.getUint32(entry + 8, little);
    entries.set(tag, { type, count: length, offset });
  }
  return entries;
}

function readAscii(view: DataView, entry: Entry): string {
  if (entry.type !== TYPE_ASCII) return "";
  let text = "";
  for (let i = 0; i < entry.count; i += 1) {
    if (entry.offset + i >= view.byteLength) break;
    const code = view.getUint8(entry.offset + i);
    if (code === 0) break;
    text += String.fromCharCode(code);
  }
  return text;
}

/** Une coordonnée GPS EXIF : trois rationnels, degrés / minutes / secondes. */
function readGpsCoordinate(view: DataView, entry: Entry, little: boolean): number | null {
  if (entry.type !== TYPE_RATIONAL || entry.count < 3) return null;
  if (entry.offset + 24 > view.byteLength) return null;

  let value = 0;
  for (let i = 0; i < 3; i += 1) {
    const numerator = view.getUint32(entry.offset + i * 8, little);
    const denominator = view.getUint32(entry.offset + i * 8 + 4, little);
    if (denominator === 0) return null;
    value += numerator / denominator / 60 ** i;
  }
  return value;
}

/** Localise le bloc TIFF du segment APP1, s'il existe. */
function findTiff(view: DataView): { start: number; little: boolean } | null {
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null; // pas un JPEG

  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return null;

    const marker = view.getUint8(offset + 1);
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (marker === 0xda) return null; // début des données image : plus d'EXIF après

    const segmentLength = view.getUint16(offset + 2);
    if (segmentLength < 2) return null;

    if (marker === 0xe1) {
      const app1 = offset + 4;
      // Signature "Exif\0\0"
      if (
        app1 + 6 <= view.byteLength &&
        view.getUint32(app1) === 0x45786966 &&
        view.getUint16(app1 + 4) === 0x0000
      ) {
        const start = app1 + 6;
        if (start + 8 > view.byteLength) return null;

        const byteOrder = view.getUint16(start);
        if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) return null;
        return { start, little: byteOrder === 0x4949 };
      }
    }

    offset += 2 + segmentLength;
  }
  return null;
}

/** Date de prise de vue et coordonnées GPS. Champs à `null` si absents. */
export async function readExifMetadata(file: File): Promise<ExifMetadata> {
  const empty: ExifMetadata = { takenAt: null, latitude: null, longitude: null };

  try {
    const header = await file.slice(0, HEADER_BYTES).arrayBuffer();
    const view = new DataView(header);

    const tiff = findTiff(view);
    if (!tiff) return empty;

    const { start, little } = tiff;
    const ifd0 = readIfd(view, start, view.getUint32(start + 4, little), little);

    let takenAt: Date | null = null;
    const exifPointer = ifd0.get(TAG_EXIF_IFD_POINTER);
    if (exifPointer) {
      const exif = readIfd(view, start, view.getUint32(exifPointer.offset, little), little);
      for (const tag of [TAG_DATETIME_ORIGINAL, TAG_DATETIME_DIGITIZED]) {
        const entry = exif.get(tag);
        if (!entry) continue;
        takenAt = parseExifDate(readAscii(view, entry));
        if (takenAt) break;
      }
    }
    if (!takenAt) {
      const entry = ifd0.get(TAG_DATETIME);
      if (entry) takenAt = parseExifDate(readAscii(view, entry));
    }

    let latitude: number | null = null;
    let longitude: number | null = null;
    const gpsPointer = ifd0.get(TAG_GPS_IFD_POINTER);
    if (gpsPointer) {
      const gps = readIfd(view, start, view.getUint32(gpsPointer.offset, little), little);

      const latEntry = gps.get(GPS_LATITUDE);
      const lonEntry = gps.get(GPS_LONGITUDE);
      if (latEntry && lonEntry) {
        const lat = readGpsCoordinate(view, latEntry, little);
        const lon = readGpsCoordinate(view, lonEntry, little);

        // L'EXIF stocke une valeur absolue et l'hémisphère à part.
        const latRef = gps.get(GPS_LATITUDE_REF);
        const lonRef = gps.get(GPS_LONGITUDE_REF);
        const south = latRef ? readAscii(view, latRef).toUpperCase().startsWith("S") : false;
        const west = lonRef ? readAscii(view, lonRef).toUpperCase().startsWith("W") : false;

        if (lat !== null && lon !== null && (lat !== 0 || lon !== 0)) {
          latitude = south ? -lat : lat;
          longitude = west ? -lon : lon;
        }
      }
    }

    return { takenAt, latitude, longitude };
  } catch {
    return empty;
  }
}

/** Extrait la date de prise de vue d'un JPEG. `null` si absente ou illisible. */
export async function readExifDate(file: File): Promise<Date | null> {
  return (await readExifMetadata(file)).takenAt;
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
