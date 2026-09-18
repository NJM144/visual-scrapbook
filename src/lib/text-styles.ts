/**
 * Écriture et couleur du texte, pour tout l'album.
 *
 * Le thème propose une typographie et une encre ; l'auteur peut les remplacer,
 * une fois, pour tout le livre — couverture, titres, légendes, paragraphes,
 * numéros de page. Ce sont des réglages d'album (colonnes `text_font`,
 * `ink_color`, `cover_ink_color`), pas de page : une écriture qui changerait
 * d'une page à l'autre ne serait plus une écriture, mais un accident.
 *
 * Les quatre familles sont **servies par le site** (public/fonts) et non par
 * Google : le même fichier habille l'aperçu à l'écran et s'embarque dans le
 * PDF. Sans cela, l'imprimeur recevrait du Times là où l'auteur a choisi une
 * écriture manuscrite. Toutes sont sous licence SIL OFL, qui autorise
 * l'incorporation dans un document imprimé, y compris vendu.
 */

export interface TextStyle {
  id: string;
  label: string;
  /** Ce que l'écriture évoque, pour choisir sans jargon. */
  hint: string;
  /** Pile CSS pour l'aperçu. */
  css: string;
  /** Fichiers embarqués dans le PDF ; l'italique retombe sur le romain s'il manque. */
  regular: string;
  italic?: string;
  /**
   * Découper la police à l'embarquement (seuls les caractères utilisés
   * voyagent). Vrai par défaut ; faux pour la manuscrite, dont les glyphes se
   * perdaient au découpage de pdf-lib — le fichier est allégé d'avance à
   * l'alphabet latin, il pèse moins lourd entier qu'une police complète.
   */
  subset?: boolean;
  /**
   * Correction de taille : à corps égal, une manuscrite paraît plus petite
   * qu'un romain. Le facteur s'applique partout, écran et PDF, pour que le
   * changement d'écriture ne bouscule pas la mise en page.
   */
  scale: number;
}

export const TEXT_STYLES: TextStyle[] = [
  {
    id: "classique",
    label: "Classique",
    hint: "L’écriture des livres, avec ses pleins et ses déliés.",
    css: '"Instrument Serif", ui-serif, Georgia, serif',
    regular: "/fonts/instrument-serif.ttf",
    italic: "/fonts/instrument-serif-italic.ttf",
    scale: 1,
  },
  {
    id: "moderne",
    label: "Moderne",
    hint: "Des lettres nettes, sans empattement. Sobre et très lisible.",
    css: '"Instrument Sans", ui-sans-serif, system-ui, sans-serif',
    regular: "/fonts/instrument-sans.ttf",
    italic: "/fonts/instrument-sans-italic.ttf",
    scale: 0.94,
  },
  {
    id: "manuscrite",
    label: "Manuscrite",
    hint: "Une écriture à la main, comme une dédicace au dos d’une photo.",
    css: '"Caveat", "Segoe Script", cursive',
    // Version aplatie et allégée de Caveat (sans variantes contextuelles ni
    // crénage, alphabet latin seul) : l'originale perdait des lettres dans le
    // PDF. La même sert à l'écran, pour que l'aperçu reste fidèle.
    regular: "/fonts/caveat.ttf",
    subset: false,
    scale: 1.25,
  },
  {
    id: "machine",
    label: "Machine à écrire",
    hint: "Lettres à chasse fixe, air de vieux carnet de voyage.",
    css: '"Courier Prime", ui-monospace, "Courier New", monospace',
    regular: "/fonts/courier-prime.ttf",
    italic: "/fonts/courier-prime-italic.ttf",
    scale: 0.92,
  },
];

export const DEFAULT_TEXT_STYLE = "classique";

/**
 * Encres proposées : des tons qui tiennent à l'impression.
 *
 * Ce sont des couleurs de *texte*, pas de papier : elles doivent rester
 * lisibles sur un fond clair, sauf les deux dernières, faites pour un fond
 * sombre ou une photo.
 */
export const INK_PALETTE: { hex: string; label: string }[] = [
  { hex: "#141414", label: "Encre" },
  { hex: "#3A2418", label: "Brun" },
  { hex: "#1E5B3A", label: "Forêt" },
  { hex: "#141B33", label: "Nuit" },
  { hex: "#7A2E22", label: "Brique" },
  { hex: "#B8562F", label: "Terre cuite" },
  { hex: "#C2A377", label: "Ocre" },
  { hex: "#6B7280", label: "Ardoise" },
  { hex: "#FBF6EE", label: "Crème" },
  { hex: "#FFFFFF", label: "Blanc" },
];

const BY_ID = new Map(TEXT_STYLES.map((style) => [style.id, style]));

/**
 * L'écriture de l'album ; à défaut, celle qui suit le thème.
 *
 * Un thème « sans serif » retombe donc sur Moderne, un thème serif sur
 * Classique : ne rien choisir ne change rien à ce qui existait.
 */
export function findTextStyle(
  id: string | null | undefined,
  themeFont: "serif" | "sans" = "serif",
): TextStyle {
  const chosen = id ? BY_ID.get(id) : undefined;
  if (chosen) return chosen;
  return themeFont === "sans" ? BY_ID.get("moderne")! : BY_ID.get("classique")!;
}

/** Couleur retenue : celle de l'album si elle est valable, sinon celle du thème. */
export function resolveInk(chosen: string | null | undefined, themeInk: string): string {
  return chosen && /^#[0-9a-fA-F]{6}$/.test(chosen) ? chosen : themeInk;
}
