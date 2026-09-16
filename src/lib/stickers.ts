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
  { id: "emoji-amour", label: "Emoji · Amour" },
  { id: "emoji-fete", label: "Emoji · Fête" },
  { id: "emoji-bebe", label: "Emoji · Bébé" },
  { id: "emoji-visages", label: "Emoji · Visages" },
  { id: "emoji-gens", label: "Emoji · Ensemble" },
  { id: "emoji-nature", label: "Emoji · Nature" },
  { id: "emoji-voyage", label: "Emoji · Voyage" },
  { id: "emoji-table", label: "Emoji · À table" },
  { id: "emoji-souvenirs", label: "Emoji · Souvenirs" },
  { id: "emoji-animaux", label: "Emoji · Animaux" },
  { id: "emoji-signes", label: "Emoji · Signes" },
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

  /* ------------------------------------------------------------------ emoji
   *
   * Dessins Twemoji, sous licence Creative Commons BY 4.0 : libres d'usage,
   * y compris sur un livre vendu, à condition de citer leur origine — ce que
   * fait le pied de page du site et la fiche technique de l'impression.
   *
   * Rasterisés à 320 px depuis les SVG d'origine (scratchpad/mkemoji.cjs) :
   * les PNG officiels de Twemoji ne font que 72 px, soit 61 dpi sur un
   * sticker de 3 cm. À 320 px, on imprime 25 mm à 325 dpi.
   */
  { id: "emoji-2764", label: "❤️ cœur rouge", family: "emoji-amour", ratio: 1 },
  { id: "emoji-1f49b", label: "💛 cœur jaune", family: "emoji-amour", ratio: 1 },
  { id: "emoji-1f49a", label: "💚 cœur vert", family: "emoji-amour", ratio: 1 },
  { id: "emoji-1f499", label: "💙 cœur bleu", family: "emoji-amour", ratio: 1 },
  { id: "emoji-1f9e1", label: "🧡 cœur orange", family: "emoji-amour", ratio: 1 },
  { id: "emoji-1f496", label: "💖 cœur scintillant", family: "emoji-amour", ratio: 1 },
  { id: "emoji-1f495", label: "💕 deux cœurs", family: "emoji-amour", ratio: 1 },
  { id: "emoji-1f49e", label: "💞 cœurs qui tournent", family: "emoji-amour", ratio: 1 },
  { id: "emoji-1f60d", label: "😍 yeux en cœur", family: "emoji-amour", ratio: 1 },
  { id: "emoji-1f970", label: "🥰 sourire attendri", family: "emoji-amour", ratio: 1 },
  { id: "emoji-1f618", label: "😘 bisou", family: "emoji-amour", ratio: 1 },
  { id: "emoji-1f48b", label: "💋 rouge à lèvres", family: "emoji-amour", ratio: 1 },
  { id: "emoji-1f48d", label: "💍 bague", family: "emoji-amour", ratio: 1 },
  { id: "emoji-1f490", label: "💐 bouquet", family: "emoji-amour", ratio: 1 },
  { id: "emoji-1f339", label: "🌹 rose", family: "emoji-amour", ratio: 1 },
  { id: "emoji-1f470", label: "👰 mariée", family: "emoji-amour", ratio: 1 },
  { id: "emoji-1f935", label: "🤵 marié", family: "emoji-amour", ratio: 1 },
  { id: "emoji-1f492", label: "💒 église", family: "emoji-amour", ratio: 1 },
  { id: "emoji-1f389", label: "🎉 cotillon", family: "emoji-fete", ratio: 1 },
  { id: "emoji-1f38a", label: "🎊 confettis", family: "emoji-fete", ratio: 1 },
  { id: "emoji-1f388", label: "🎈 ballon", family: "emoji-fete", ratio: 1 },
  { id: "emoji-1f382", label: "🎂 gâteau d’anniversaire", family: "emoji-fete", ratio: 1 },
  { id: "emoji-1f370", label: "🍰 part de gâteau", family: "emoji-fete", ratio: 1 },
  { id: "emoji-1f973", label: "🥳 visage de fête", family: "emoji-fete", ratio: 1 },
  { id: "emoji-1f381", label: "🎁 cadeau", family: "emoji-fete", ratio: 1 },
  { id: "emoji-1f380", label: "🎀 nœud", family: "emoji-fete", ratio: 1 },
  { id: "emoji-2728", label: "✨ étincelles", family: "emoji-fete", ratio: 1 },
  { id: "emoji-1f31f", label: "🌟 étoile brillante", family: "emoji-fete", ratio: 1 },
  { id: "emoji-2b50", label: "⭐ étoile", family: "emoji-fete", ratio: 1 },
  { id: "emoji-1f942", label: "🥂 trinquer", family: "emoji-fete", ratio: 1 },
  { id: "emoji-1f37e", label: "🍾 champagne", family: "emoji-fete", ratio: 1 },
  { id: "emoji-1f3b5", label: "🎵 note", family: "emoji-fete", ratio: 1 },
  { id: "emoji-1f3b6", label: "🎶 notes", family: "emoji-fete", ratio: 1 },
  { id: "emoji-1f483", label: "💃 danseuse", family: "emoji-fete", ratio: 1 },
  { id: "emoji-1f57a", label: "🕺 danseur", family: "emoji-fete", ratio: 1 },
  { id: "emoji-1f386", label: "🎆 feu d’artifice", family: "emoji-fete", ratio: 1 },
  { id: "emoji-1f387", label: "🎇 étincelle", family: "emoji-fete", ratio: 1 },
  { id: "emoji-1fa98", label: "🪘 tambour", family: "emoji-fete", ratio: 1 },
  { id: "emoji-1f476", label: "👶 bébé", family: "emoji-bebe", ratio: 1 },
  { id: "emoji-1f37c", label: "🍼 biberon", family: "emoji-bebe", ratio: 1 },
  { id: "emoji-1f9f8", label: "🧸 ours en peluche", family: "emoji-bebe", ratio: 1 },
  { id: "emoji-1f36d", label: "🍭 sucette", family: "emoji-bebe", ratio: 1 },
  { id: "emoji-1f9c1", label: "🧁 petit gâteau", family: "emoji-bebe", ratio: 1 },
  { id: "emoji-1f47c", label: "👼 angelot", family: "emoji-bebe", ratio: 1 },
  { id: "emoji-1f423", label: "🐣 poussin", family: "emoji-bebe", ratio: 1 },
  { id: "emoji-1f3a0", label: "🎠 manège", family: "emoji-bebe", ratio: 1 },
  { id: "emoji-1fa81", label: "🪁 cerf-volant", family: "emoji-bebe", ratio: 1 },
  { id: "emoji-1f600", label: "😀 sourire", family: "emoji-visages", ratio: 1 },
  { id: "emoji-1f604", label: "😄 rire", family: "emoji-visages", ratio: 1 },
  { id: "emoji-1f601", label: "😁 grand sourire", family: "emoji-visages", ratio: 1 },
  { id: "emoji-1f602", label: "😂 rire aux larmes", family: "emoji-visages", ratio: 1 },
  { id: "emoji-1f60a", label: "😊 sourire doux", family: "emoji-visages", ratio: 1 },
  { id: "emoji-1f979", label: "🥹 émotion", family: "emoji-visages", ratio: 1 },
  { id: "emoji-1f60e", label: "😎 lunettes de soleil", family: "emoji-visages", ratio: 1 },
  { id: "emoji-1f917", label: "🤗 câlin", family: "emoji-visages", ratio: 1 },
  { id: "emoji-1f929", label: "🤩 admiration", family: "emoji-visages", ratio: 1 },
  { id: "emoji-1f607", label: "😇 auréole", family: "emoji-visages", ratio: 1 },
  { id: "emoji-1f634", label: "😴 endormi", family: "emoji-visages", ratio: 1 },
  { id: "emoji-1f92d", label: "🤭 pouffe", family: "emoji-visages", ratio: 1 },
  { id: "emoji-1f46a", label: "👪 famille", family: "emoji-gens", ratio: 1 },
  { id: "emoji-1f46b", label: "👫 couple", family: "emoji-gens", ratio: 1 },
  {
    id: "emoji-1f9d1-200d-1f91d-200d-1f9d1",
    label: "🧑‍🤝‍🧑 main dans la main",
    family: "emoji-gens",
    ratio: 1,
  },
  { id: "emoji-1f64c", label: "🙌 bras levés", family: "emoji-gens", ratio: 1 },
  { id: "emoji-1f44f", label: "👏 applaudissements", family: "emoji-gens", ratio: 1 },
  { id: "emoji-1f91d", label: "🤝 poignée de main", family: "emoji-gens", ratio: 1 },
  { id: "emoji-1f64f", label: "🙏 merci", family: "emoji-gens", ratio: 1 },
  { id: "emoji-1f4aa", label: "💪 force", family: "emoji-gens", ratio: 1 },
  { id: "emoji-1faf6", label: "🫶 cœur des mains", family: "emoji-gens", ratio: 1 },
  { id: "emoji-1f31e", label: "🌞 soleil", family: "emoji-nature", ratio: 1 },
  { id: "emoji-1f319", label: "🌙 lune", family: "emoji-nature", ratio: 1 },
  { id: "emoji-1f308", label: "🌈 arc-en-ciel", family: "emoji-nature", ratio: 1 },
  { id: "emoji-1f334", label: "🌴 palmier", family: "emoji-nature", ratio: 1 },
  { id: "emoji-1f33a", label: "🌺 hibiscus", family: "emoji-nature", ratio: 1 },
  { id: "emoji-1f33b", label: "🌻 tournesol", family: "emoji-nature", ratio: 1 },
  { id: "emoji-1f33c", label: "🌼 marguerite", family: "emoji-nature", ratio: 1 },
  { id: "emoji-1f337", label: "🌷 tulipe", family: "emoji-nature", ratio: 1 },
  { id: "emoji-1f340", label: "🍀 trèfle", family: "emoji-nature", ratio: 1 },
  { id: "emoji-1f30a", label: "🌊 vague", family: "emoji-nature", ratio: 1 },
  { id: "emoji-1f3d6", label: "🏖️ plage", family: "emoji-nature", ratio: 1 },
  { id: "emoji-26f1", label: "⛱️ parasol", family: "emoji-nature", ratio: 1 },
  { id: "emoji-1f41a", label: "🐚 coquillage", family: "emoji-nature", ratio: 1 },
  { id: "emoji-1f525", label: "🔥 feu", family: "emoji-nature", ratio: 1 },
  { id: "emoji-2708", label: "✈️ avion", family: "emoji-voyage", ratio: 1 },
  { id: "emoji-1f697", label: "🚗 voiture", family: "emoji-voyage", ratio: 1 },
  { id: "emoji-1f68c", label: "🚌 bus", family: "emoji-voyage", ratio: 1 },
  { id: "emoji-1f6f5", label: "🛵 scooter", family: "emoji-voyage", ratio: 1 },
  { id: "emoji-1f6e5", label: "🛥️ bateau", family: "emoji-voyage", ratio: 1 },
  { id: "emoji-1f5fa", label: "🗺️ carte", family: "emoji-voyage", ratio: 1 },
  { id: "emoji-1f4cd", label: "📍 épingle", family: "emoji-voyage", ratio: 1 },
  { id: "emoji-1f9f3", label: "🧳 valise", family: "emoji-voyage", ratio: 1 },
  { id: "emoji-1f392", label: "🎒 sac à dos", family: "emoji-voyage", ratio: 1 },
  { id: "emoji-1f3dd", label: "🏝️ île", family: "emoji-voyage", ratio: 1 },
  { id: "emoji-1f372", label: "🍲 marmite", family: "emoji-table", ratio: 1 },
  { id: "emoji-1f35a", label: "🍚 riz", family: "emoji-table", ratio: 1 },
  { id: "emoji-1f357", label: "🍗 poulet", family: "emoji-table", ratio: 1 },
  { id: "emoji-1f958", label: "🥘 plat", family: "emoji-table", ratio: 1 },
  { id: "emoji-1f379", label: "🍹 cocktail", family: "emoji-table", ratio: 1 },
  { id: "emoji-2615", label: "☕ café", family: "emoji-table", ratio: 1 },
  { id: "emoji-1f36b", label: "🍫 chocolat", family: "emoji-table", ratio: 1 },
  { id: "emoji-1f349", label: "🍉 pastèque", family: "emoji-table", ratio: 1 },
  { id: "emoji-1f96d", label: "🥭 mangue", family: "emoji-table", ratio: 1 },
  { id: "emoji-1f34c", label: "🍌 banane", family: "emoji-table", ratio: 1 },
  { id: "emoji-1f965", label: "🥥 noix de coco", family: "emoji-table", ratio: 1 },
  { id: "emoji-1f35e", label: "🍞 pain", family: "emoji-table", ratio: 1 },
  { id: "emoji-1f4f8", label: "📸 appareil photo", family: "emoji-souvenirs", ratio: 1 },
  { id: "emoji-1f4f7", label: "📷 photo", family: "emoji-souvenirs", ratio: 1 },
  { id: "emoji-1f3a5", label: "🎥 caméra", family: "emoji-souvenirs", ratio: 1 },
  { id: "emoji-1f4d6", label: "📖 livre", family: "emoji-souvenirs", ratio: 1 },
  { id: "emoji-270f", label: "✏️ crayon", family: "emoji-souvenirs", ratio: 1 },
  { id: "emoji-1f48c", label: "💌 lettre", family: "emoji-souvenirs", ratio: 1 },
  { id: "emoji-1f3c6", label: "🏆 trophée", family: "emoji-souvenirs", ratio: 1 },
  { id: "emoji-1f947", label: "🥇 médaille", family: "emoji-souvenirs", ratio: 1 },
  { id: "emoji-1f393", label: "🎓 diplôme", family: "emoji-souvenirs", ratio: 1 },
  { id: "emoji-26bd", label: "⚽ ballon", family: "emoji-souvenirs", ratio: 1 },
  { id: "emoji-1f3a8", label: "🎨 peinture", family: "emoji-souvenirs", ratio: 1 },
  { id: "emoji-1f3a4", label: "🎤 micro", family: "emoji-souvenirs", ratio: 1 },
  { id: "emoji-1f941", label: "🥁 batterie", family: "emoji-souvenirs", ratio: 1 },
  { id: "emoji-1f418", label: "🐘 éléphant", family: "emoji-animaux", ratio: 1 },
  { id: "emoji-1f981", label: "🦁 lion", family: "emoji-animaux", ratio: 1 },
  { id: "emoji-1f412", label: "🐒 singe", family: "emoji-animaux", ratio: 1 },
  { id: "emoji-1f99c", label: "🦜 perroquet", family: "emoji-animaux", ratio: 1 },
  { id: "emoji-1f422", label: "🐢 tortue", family: "emoji-animaux", ratio: 1 },
  { id: "emoji-1f98b", label: "🦋 papillon", family: "emoji-animaux", ratio: 1 },
  { id: "emoji-1f41d", label: "🐝 abeille", family: "emoji-animaux", ratio: 1 },
  { id: "emoji-1f436", label: "🐶 chien", family: "emoji-animaux", ratio: 1 },
  { id: "emoji-1f431", label: "🐱 chat", family: "emoji-animaux", ratio: 1 },
  { id: "emoji-1f41f", label: "🐟 poisson", family: "emoji-animaux", ratio: 1 },
  { id: "emoji-1f4af", label: "💯 cent points", family: "emoji-signes", ratio: 1 },
  { id: "emoji-2757", label: "❗ exclamation", family: "emoji-signes", ratio: 1 },
  { id: "emoji-2753", label: "❓ question", family: "emoji-signes", ratio: 1 },
  { id: "emoji-26a1", label: "⚡ éclair", family: "emoji-signes", ratio: 1 },
  { id: "emoji-1f3af", label: "🎯 cible", family: "emoji-signes", ratio: 1 },
  { id: "emoji-2714", label: "✔️ coche", family: "emoji-signes", ratio: 1 },
  { id: "emoji-1f54a", label: "🕊️ colombe", family: "emoji-signes", ratio: 1 },
  { id: "emoji-2600", label: "☀️ soleil radieux", family: "emoji-signes", ratio: 1 },
];

/** Les emoji sont reconnaissables à leur famille. */
export function isEmoji(sticker: Sticker): boolean {
  return sticker.family.startsWith("emoji-");
}

export const EMOJI_CREDIT = "Emoji : Twemoji — © Twitter, Inc. et contributeurs, licence CC-BY 4.0";

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
