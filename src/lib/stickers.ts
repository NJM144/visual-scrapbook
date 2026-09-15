/**
 * Stickers : des vignettes qu'on pose sur une page, par-dessus les photos.
 *
 * La collection est dessinée pour ce site — vectorielle à l'origine, donc
 * nette quelle que soit la taille d'impression, et libre de droits pour nous.
 * Les fichiers vivent dans public/stickers, en PNG transparent : le PDF sait
 * lire le PNG, et la transparence est justement ce qu'on vient chercher.
 * Le catalogue est ouvert : une image déposée sous un nouvel identifiant, une
 * ligne ici, et elle apparaît dans le choix.
 *
 * Un sticker est rangé dans la page (`PageStyle.stickers`), pas dans une case :
 * il se pose où il veut, à cheval sur deux photos si l'auteur le décide. Sa
 * position et sa taille sont des fractions de la page, jamais des pixels —
 * la même page s'imprime en 15 cm comme en 30 cm.
 */

export interface Sticker {
  id: string;
  label: string;
  family: string;
  /** Largeur / hauteur du dessin ; sert à calculer la hauteur à l'affichage. */
  ratio: number;
}

export const STICKER_FAMILIES: { id: string; label: string }[] = [
  { id: "fete", label: "Fête" },
  { id: "amour", label: "Amour" },
  { id: "bebe", label: "Bébé" },
  { id: "ici", label: "D’ici" },
  { id: "souvenir", label: "Souvenirs" },
  { id: "mots", label: "Mots" },
];

export const STICKERS: Sticker[] = [
  { id: "coeur", label: "Cœur", family: "amour", ratio: 1.042 },
  { id: "coeurs-deux", label: "Deux cœurs", family: "amour", ratio: 1.25 },
  { id: "alliances", label: "Alliances", family: "amour", ratio: 1.545 },
  { id: "fleur", label: "Fleur", family: "amour", ratio: 1 },
  { id: "colombe", label: "Colombe", family: "amour", ratio: 1.364 },
  { id: "etoile", label: "Étoile", family: "fete", ratio: 1 },
  { id: "etincelles", label: "Étincelles", family: "fete", ratio: 1 },
  { id: "confettis", label: "Confettis", family: "fete", ratio: 1 },
  { id: "ballon", label: "Ballon", family: "fete", ratio: 0.688 },
  { id: "gateau", label: "Gâteau", family: "fete", ratio: 1 },
  { id: "feu-artifice", label: "Feu d’artifice", family: "fete", ratio: 1 },
  { id: "chausson", label: "Chausson", family: "bebe", ratio: 1.25 },
  { id: "nuage-etoiles", label: "Nuage et étoiles", family: "bebe", ratio: 1.417 },
  { id: "palmier", label: "Palmier", family: "ici", ratio: 0.875 },
  { id: "soleil", label: "Soleil", family: "ici", ratio: 1 },
  { id: "kente", label: "Bande kente", family: "ici", ratio: 3.714 },
  { id: "adinkra", label: "Losange adinkra", family: "ici", ratio: 1 },
  { id: "appareil-photo", label: "Appareil photo", family: "souvenir", ratio: 1.333 },
  { id: "coin-photo", label: "Coin de photo", family: "souvenir", ratio: 1 },
  { id: "note-musique", label: "Note de musique", family: "souvenir", ratio: 0.786 },
  { id: "zo", label: "« Zo ! »", family: "mots", ratio: 1.733 },
  { id: "bravo", label: "« Bravo »", family: "mots", ratio: 1.867 },
  { id: "merci", label: "« Merci »", family: "mots", ratio: 1.867 },
  { id: "felicitations", label: "« Félicitations »", family: "mots", ratio: 4.107 },
];

/** Sticker posé sur une page. */
export interface PageSticker {
  id: string;
  /** Centre du sticker, en fraction de la page (0 à 1). */
  x: number;
  y: number;
  /** Largeur, en fraction de la largeur de la page. */
  size: number;
  /** Inclinaison, en degrés ; 0 = droit. */
  rot?: number;
}

/** Au-delà, un sticker mange la page ; en deçà, il ne se voit plus. */
export const MIN_STICKER_SIZE = 0.05;
export const MAX_STICKER_SIZE = 0.65;
export const DEFAULT_STICKER_SIZE = 0.22;
/** Autant de stickers sur une page, et la photo disparaît dessous. */
export const MAX_STICKERS_PER_PAGE = 12;

const BY_ID = new Map(STICKERS.map((sticker) => [sticker.id, sticker]));

export function findSticker(id: string | null | undefined): Sticker | null {
  return id ? (BY_ID.get(id) ?? null) : null;
}

/** Fichier du sticker : le même PNG pour l'écran et pour le PDF. */
export function stickerUrl(id: string): string {
  return "/stickers/" + id + ".png";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Ramène un sticker dans les limites, et l'écarte s'il n'existe pas.
 *
 * Un identifiant inconnu — collection modifiée, album importé — ne doit pas
 * laisser un trou blanc dans la page : on préfère ne rien poser.
 */
export function normalizeSticker(value: unknown): PageSticker | null {
  if (!value || typeof value !== "object") return null;
  const sticker = value as PageSticker;
  if (typeof sticker.id !== "string" || !BY_ID.has(sticker.id)) return null;
  if (typeof sticker.x !== "number" || typeof sticker.y !== "number") return null;
  if (typeof sticker.size !== "number") return null;

  const out: PageSticker = {
    id: sticker.id,
    // Un peu de débordement est permis : un sticker à cheval sur le bord est
    // une intention de mise en page, le fond perdu est là pour ça.
    x: clamp(sticker.x, -0.1, 1.1),
    y: clamp(sticker.y, -0.1, 1.1),
    size: clamp(sticker.size, MIN_STICKER_SIZE, MAX_STICKER_SIZE),
  };
  if (typeof sticker.rot === "number" && sticker.rot !== 0) {
    out.rot = clamp(Math.round(sticker.rot), -180, 180);
  }
  return out;
}

export function normalizeStickers(value: unknown): PageSticker[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const list = value
    .map(normalizeSticker)
    .filter((sticker): sticker is PageSticker => sticker !== null)
    .slice(0, MAX_STICKERS_PER_PAGE);
  return list.length > 0 ? list : undefined;
}
