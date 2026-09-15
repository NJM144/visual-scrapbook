/**
 * Blocs de texte posés dans les cases du livre.
 *
 * Une case de page porte soit une photo, soit un paragraphe : c'est le même
 * découpage, donc un texte se place, se déplace et se redimensionne comme une
 * photo. Un paragraphe n'est pas une légende — la légende tient sous l'image,
 * en une ligne ; ici on raconte.
 *
 * Les tailles sont en millimètres, comme tout le reste de la composition :
 * l'écran les convertit en unités de conteneur, le PDF en points. Une taille
 * exprimée en pixels ne voudrait rien dire sur un livre de 30 cm.
 */

export type TextAlign = "gauche" | "centre";

export interface TextBlock {
  text: string;
  align?: TextAlign;
  size?: string;
}

export interface TextSize {
  id: string;
  label: string;
  /** Hauteur des caractères, en millimètres sur la page imprimée. */
  mm: number;
}

export const TEXT_SIZES: TextSize[] = [
  { id: "petit", label: "Petit", mm: 3.1 },
  { id: "moyen", label: "Moyen", mm: 4 },
  { id: "grand", label: "Grand", mm: 5.4 },
  { id: "titre", label: "Titre", mm: 7.5 },
];

export const DEFAULT_TEXT_SIZE = "moyen";
export const TEXT_ALIGNS: TextAlign[] = ["gauche", "centre"];

/** Un paragraphe plus long qu'une page ne s'imprimerait pas : on borne à la saisie. */
export const MAX_TEXT_LENGTH = 1200;

/** Interligne : 1,35 fois la hauteur des caractères, comme dans un livre. */
export const LINE_HEIGHT = 1.35;

/** Marge intérieure de la case, pour que le texte ne colle pas à la photo voisine. */
export const TEXT_PADDING_MM = 3;

export function findTextSize(id: string | null | undefined): TextSize {
  return TEXT_SIZES.find((size) => size.id === id) ?? TEXT_SIZES[1]!;
}

export function isTextBlock(value: unknown): value is TextBlock {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const block = value as TextBlock;
  if (typeof block.text !== "string" || block.text.length > MAX_TEXT_LENGTH) return false;
  if (block.align !== undefined && !TEXT_ALIGNS.includes(block.align)) return false;
  if (block.size !== undefined && !TEXT_SIZES.some((size) => size.id === block.size)) return false;
  return true;
}

/** Le bloc réduit à ses champs utiles : le JSON de l'album reste net. */
export function normalizeTextBlock(block: TextBlock): TextBlock {
  const out: TextBlock = { text: block.text.slice(0, MAX_TEXT_LENGTH) };
  if (block.align && block.align !== "gauche") out.align = block.align;
  if (block.size && block.size !== DEFAULT_TEXT_SIZE) out.size = block.size;
  return out;
}

/**
 * Découpe le texte en lignes qui tiennent dans `maxWidth`.
 *
 * `measure` mesure une chaîne dans l'unité de `maxWidth` : le PDF y passe la
 * largeur de sa police, ce qui rend cette fonction indépendante du support.
 * Les retours à la ligne saisis par l'auteur sont respectés — c'est ainsi
 * qu'on sépare deux paragraphes.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  measure: (value: string) => number,
): string[] {
  const lines: string[] = [];

  for (const paragraph of text.split(/\r?\n/)) {
    if (paragraph.trim() === "") {
      lines.push("");
      continue;
    }

    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? line + " " + word : word;
      if (line && measure(candidate) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
  }

  return lines;
}
