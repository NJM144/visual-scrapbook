/**
 * Les emoji écrits dans un texte — titre, légende, paragraphe.
 *
 * Aucune des écritures du livre n'a de dessins d'emoji : tapés au clavier du
 * téléphone, ils sortaient du PDF en petits carrés vides. On les remplace
 * donc, à l'impression comme à l'écran, par les dessins Twemoji — les mêmes
 * que ceux des stickers, sous la même licence CC-BY 4.0. L'aperçu montre
 * ainsi exactement l'emoji qui sera imprimé, quel que soit le téléphone : un
 * cœur Apple et un cœur Samsung ne se ressemblent pas, un cœur Twemoji si.
 */

/** Morceau d'un texte : du texte ordinaire, ou un emoji et son fichier Twemoji. */
export type Morceau =
  { type: "texte"; valeur: string } | { type: "emoji"; valeur: string; code: string };

const TWEMOJI_SVG = "https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/";

/**
 * Découpe en « graphèmes » : ce que l'œil voit comme un seul caractère. Un
 * emoji de famille (👨‍👩‍👧) compte cinq points de code et un seul dessin.
 */
export const graphemes = (texte: string): string[] => {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter("fr", { granularity: "grapheme" });
    return [...segmenter.segment(texte)].map((segment) => segment.segment);
  }
  return [...texte];
};

const PICTOGRAPHIQUE = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
/** ©, ® et ™ sont « pictographiques » pour Unicode, mais nos polices les dessinent. */
const DANS_LES_POLICES = new Set([0xa9, 0xae, 0x2122]);

export function estEmoji(grapheme: string): boolean {
  if (/‍|️|⃣/u.test(grapheme)) return true;
  const premier = grapheme.codePointAt(0) ?? 0;
  if (DANS_LES_POLICES.has(premier) && grapheme.length === 1) return false;
  return PICTOGRAPHIQUE.test(grapheme);
}

/**
 * Nom du fichier Twemoji : les points de code en hexadécimal, reliés par des
 * tirets. Le sélecteur de variante (FE0F) est retiré, sauf dans les séquences
 * liées (ZWJ) — c'est la convention de Twemoji lui-même.
 */
export function codeTwemoji(grapheme: string): string {
  const garde = grapheme.includes("‍") ? grapheme : grapheme.replace(/️/g, "");
  return [...garde].map((c) => (c.codePointAt(0) ?? 0).toString(16)).join("-");
}

export function urlTwemoji(code: string): string {
  return TWEMOJI_SVG + code + ".svg";
}

/** Le texte en morceaux : texte continu d'un côté, emoji un par un de l'autre. */
export function decouper(texte: string): Morceau[] {
  const morceaux: Morceau[] = [];
  let courant = "";
  for (const g of graphemes(texte)) {
    if (estEmoji(g)) {
      if (courant) morceaux.push({ type: "texte", valeur: courant });
      courant = "";
      morceaux.push({ type: "emoji", valeur: g, code: codeTwemoji(g) });
    } else {
      courant += g;
    }
  }
  if (courant) morceaux.push({ type: "texte", valeur: courant });
  return morceaux;
}

/** Vrai dès qu'un texte porte au moins un emoji : le chemin rapide sinon. */
export function contientEmoji(texte: string): boolean {
  return PICTOGRAPHIQUE.test(texte) || /⃣/u.test(texte);
}

/** Tous les emoji distincts d'une liste de textes, pour les préparer d'avance. */
export function emojiDe(textes: (string | null | undefined)[]): string[] {
  const codes = new Set<string>();
  for (const texte of textes) {
    if (!texte || !contientEmoji(texte)) continue;
    for (const morceau of decouper(texte)) if (morceau.type === "emoji") codes.add(morceau.code);
  }
  return [...codes];
}
