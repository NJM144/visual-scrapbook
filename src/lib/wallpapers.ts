/**
 * Papiers peints : un fond illustré sous la couverture ou sous les pages.
 *
 * Le thème donne les couleurs et la typographie, le modèle la composition de
 * la couverture ; le papier peint habille le tout d'une texture ou d'un cadre.
 * Deux genres :
 *
 * - `cadre` : une bordure décorée autour d'un centre libre — fait pour la
 *   couverture, la page de titre, ou des pages où la photo garde ses marges ;
 * - `motif` : un dessin qui couvre toute la surface — fait pour passer
 *   derrière les photos.
 *
 * Les fichiers vivent dans public/papiers : une version WebP pour l'écran,
 * une version JPEG pour le PDF (pdf-lib ne lit pas le WebP). Les images
 * sources font ~740 px de large : sur une couverture 20 × 20, cela donne
 * ≈ 90 dpi — suffisant pour une texture, pas pour une photo. Un fichier plus
 * grand déposé sous le même nom relève la qualité sans rien changer ici.
 */

export type WallpaperKind = "cadre" | "motif";

export interface Wallpaper {
  id: string;
  label: string;
  kind: WallpaperKind;
  family: string;
  /** Dimensions du fichier d'impression, en pixels. */
  width: number;
  height: number;
  /** Fond sombre : le texte posé dessus doit être clair. */
  dark: boolean;
}

export const WALLPAPER_FAMILIES: { id: string; label: string }[] = [
  { id: "mariage", label: "Mariage" },
  { id: "naissance", label: "Naissance" },
  { id: "enfance", label: "Enfance" },
  { id: "afrique", label: "Afrique" },
  { id: "plage", label: "Plage" },
  { id: "nature", label: "Nature" },
  { id: "papier", label: "Papiers" },
  { id: "gourmandise", label: "Gourmandise" },
];

export const WALLPAPERS: Wallpaper[] = [
  {
    id: "mariage-satin",
    label: "Satin et alliances",
    kind: "cadre",
    family: "mariage",
    width: 736,
    height: 1308,
    dark: false,
  },
  {
    id: "fleurs-blanches-alliances",
    label: "Fleurs blanches, alliances",
    kind: "cadre",
    family: "mariage",
    width: 736,
    height: 1308,
    dark: false,
  },
  {
    id: "marbre-or",
    label: "Marbre et or",
    kind: "cadre",
    family: "mariage",
    width: 736,
    height: 1362,
    dark: false,
  },
  {
    id: "voile-lumiere",
    label: "Voile et lumière",
    kind: "cadre",
    family: "mariage",
    width: 736,
    height: 1308,
    dark: false,
  },
  {
    id: "pois-bleu",
    label: "Pois blancs sur bleu",
    kind: "motif",
    family: "naissance",
    width: 736,
    height: 1041,
    dark: false,
  },
  {
    id: "naissance-bleu",
    label: "Naissance, bleu",
    kind: "motif",
    family: "naissance",
    width: 736,
    height: 1104,
    dark: false,
  },
  {
    id: "naissance-rose",
    label: "Naissance, rose",
    kind: "motif",
    family: "naissance",
    width: 736,
    height: 1104,
    dark: false,
  },
  {
    id: "bulles-aquarelle",
    label: "Bulles aquarelle",
    kind: "motif",
    family: "naissance",
    width: 675,
    height: 1200,
    dark: false,
  },
  {
    id: "dessins-enfant",
    label: "Dessins d'enfant",
    kind: "cadre",
    family: "enfance",
    width: 736,
    height: 1308,
    dark: false,
  },
  {
    id: "bogolan-ocre",
    label: "Bogolan ocre",
    kind: "cadre",
    family: "afrique",
    width: 736,
    height: 951,
    dark: false,
  },
  {
    id: "motif-ethnique-blanc",
    label: "Motif ethnique, blanc",
    kind: "motif",
    family: "afrique",
    width: 630,
    height: 907,
    dark: false,
  },
  {
    id: "jute-raphia",
    label: "Jute et raphia",
    kind: "cadre",
    family: "afrique",
    width: 675,
    height: 1200,
    dark: false,
  },
  {
    id: "jute-raphia-coin",
    label: "Jute, coin de raphia",
    kind: "cadre",
    family: "afrique",
    width: 736,
    height: 1308,
    dark: false,
  },
  {
    id: "raphia-frise",
    label: "Raphia et frise",
    kind: "cadre",
    family: "afrique",
    width: 736,
    height: 1308,
    dark: false,
  },
  {
    id: "kente",
    label: "Kente",
    kind: "cadre",
    family: "afrique",
    width: 720,
    height: 1280,
    dark: false,
  },
  {
    id: "wax",
    label: "Wax",
    kind: "motif",
    family: "afrique",
    width: 736,
    height: 981,
    dark: true,
  },
  {
    id: "sable-dunes",
    label: "Sable, dunes",
    kind: "motif",
    family: "plage",
    width: 735,
    height: 1307,
    dark: false,
  },
  {
    id: "plage-vague",
    label: "Plage et vague",
    kind: "cadre",
    family: "plage",
    width: 736,
    height: 1308,
    dark: false,
  },
  {
    id: "sable-coquillages",
    label: "Sable et coquillages",
    kind: "cadre",
    family: "plage",
    width: 675,
    height: 1200,
    dark: false,
  },
  {
    id: "vacances-plage",
    label: "Vacances à la plage",
    kind: "cadre",
    family: "plage",
    width: 736,
    height: 1308,
    dark: false,
  },
  {
    id: "feuillage-automne",
    label: "Feuillage d'automne",
    kind: "cadre",
    family: "nature",
    width: 735,
    height: 1045,
    dark: false,
  },
  {
    id: "palmes-pale",
    label: "Palmes pâles",
    kind: "motif",
    family: "nature",
    width: 736,
    height: 1308,
    dark: false,
  },
  {
    id: "aquarelle-tropicale",
    label: "Aquarelle tropicale",
    kind: "cadre",
    family: "nature",
    width: 736,
    height: 1308,
    dark: false,
  },
  {
    id: "palmes-gris",
    label: "Palmes grises",
    kind: "motif",
    family: "nature",
    width: 736,
    height: 1227,
    dark: false,
  },
  {
    id: "papier-dechire-violet",
    label: "Papier déchiré, violet",
    kind: "cadre",
    family: "papier",
    width: 443,
    height: 626,
    dark: false,
  },
  {
    id: "papier-froisse-rose",
    label: "Papier froissé rosé",
    kind: "motif",
    family: "papier",
    width: 736,
    height: 1308,
    dark: false,
  },
  {
    id: "papier-rose-ruban",
    label: "Papier rose, ruban",
    kind: "cadre",
    family: "papier",
    width: 736,
    height: 1308,
    dark: false,
  },
  {
    id: "fleurs-esquisse",
    label: "Fleurs esquissées",
    kind: "motif",
    family: "papier",
    width: 640,
    height: 1136,
    dark: false,
  },
  {
    id: "patisserie-vichy",
    label: "Pâtisserie, vichy rose",
    kind: "cadre",
    family: "gourmandise",
    width: 736,
    height: 1125,
    dark: false,
  },
];

export function findWallpaper(id: string | null | undefined): Wallpaper | null {
  if (!id) return null;
  return WALLPAPERS.find((wallpaper) => wallpaper.id === id) ?? null;
}

/** Version écran, jamais plus de 1200 px de large. */
export function wallpaperScreenUrl(wallpaper: Wallpaper): string {
  return "/papiers/" + wallpaper.id + ".webp";
}

/** Version d'impression, à la taille du fichier source. */
export function wallpaperPrintUrl(wallpaper: Wallpaper): string {
  return "/papiers/" + wallpaper.id + ".jpg";
}
