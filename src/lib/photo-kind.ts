/**
 * Types et repères d'une photo, sans aucune dépendance.
 *
 * Séparés de photo-inspect.ts, qui embarque l'analyseur EXIF : importer
 * celui-ci pour un simple type le faisait entrer dans le code chargé à chaque
 * visite (70 Ko), alors qu'il ne sert qu'au worker d'import.
 */

export interface InspectRequest {
  id: string;
  file: Blob;
  name: string;
  /** Faux : date et position seulement, pour trier un import sans attendre. */
  full: boolean;
}

export interface InspectResult {
  id: string;
  /** Date de prise de vue, ISO. `null` sans EXIF. */
  takenAt: string | null;
  latitude: number | null;
  longitude: number | null;
  /** Dimensions du fichier d'impression, orientation appliquée. */
  width: number | null;
  height: number | null;
  /** SHA-256 du fichier envoyé. */
  hash: string | null;
  dominantColor: string | null;
  /** Aperçu de 400 px, montré dans l'album avant la fin de l'envoi. */
  preview: Blob | null;
  /**
   * Fichier d'impression de remplacement : un HEIC que ce navigateur sait lire
   * (Safari) devient un JPEG q 0,92 pleine définition, lisible partout — y
   * compris par l'export, qui décode les photos dans le navigateur.
   */
  print: Blob | null;
}

export const HEIC_NAME = /\.(heic|heif)$/i;

export function isHeic(blob: Blob, name: string): boolean {
  return HEIC_NAME.test(name) || /hei[cf]/i.test(blob.type);
}

export function emptyResult(id: string): InspectResult {
  return {
    id,
    takenAt: null,
    latitude: null,
    longitude: null,
    width: null,
    height: null,
    hash: null,
    dominantColor: null,
    preview: null,
    print: null,
  };
}
