/**
 * Formats et contraintes d'impression.
 *
 * Les valeurs suivent ce que demandent les imprimeries : 3 mm de fond perdu,
 * 5 mm de marge de sécurité, 300 dpi à taille réelle, pagination en multiple
 * de 4. Les changer sans l'accord de l'imprimeur, c'est produire un fichier
 * qu'il refusera.
 */

/** Débord de l'image au-delà de la coupe, sur chaque bord. */
export const BLEED_MM = 3;

/** Aucun texte ni élément important en deçà de cette distance du bord coupé. */
export const SAFETY_MM = 5;

/** Résolution de référence en impression professionnelle. */
export const DPI = 300;

/**
 * Les feuilles sont pliées puis assemblées : le nombre de pages est
 * nécessairement un multiple de 4.
 */
export const PAGE_MULTIPLE = 4;

/** En deçà, un dos carré collé ne tient pas. */
export const MIN_PAGES = 24;

/** Grammage du papier intérieur, en g/m². Sert au calcul du dos. */
export const PAPER_WEIGHT = 170;

/** Main du papier (coefficient de bouffant). 1 pour un couché classique. */
export const PAPER_BULK = 1;

/** Épaisseur des deux cartons d'une couverture rigide, en mm. */
export const HARDCOVER_BOARDS_MM = 5;

export interface PrintFormat {
  id: string;
  label: string;
  /** Largeur d'une page finie, en millimètres. */
  widthMm: number;
  /** Hauteur d'une page finie, en millimètres. */
  heightMm: number;
  description: string;
}

export const PRINT_FORMATS: PrintFormat[] = [
  {
    id: "carre_20",
    label: "Carré 20 × 20",
    widthMm: 200,
    heightMm: 200,
    description: "Le format de livre photo le plus courant. Se tient d’une main.",
  },
  {
    id: "carre_30",
    label: "Carré 30 × 30",
    widthMm: 300,
    heightMm: 300,
    description: "Grand format d’apparat. Met en valeur les paysages.",
  },
  {
    id: "a4_portrait",
    label: "A4 portrait",
    widthMm: 210,
    heightMm: 297,
    description: "Classique et économique. Idéal pour les photos verticales.",
  },
  {
    id: "a4_paysage",
    label: "A4 paysage",
    widthMm: 297,
    heightMm: 210,
    description: "Le plus adapté aux photos horizontales, la majorité des clichés.",
  },
  {
    id: "a5_portrait",
    label: "A5 portrait",
    widthMm: 148,
    heightMm: 210,
    description: "Petit livre souvenir, peu coûteux à imprimer.",
  },
];

export const DEFAULT_FORMAT_ID = "carre_20";

export function findFormat(id: string | null | undefined): PrintFormat {
  return (
    PRINT_FORMATS.find((format) => format.id === id) ??
    (PRINT_FORMATS.find((format) => format.id === DEFAULT_FORMAT_ID) as PrintFormat)
  );
}

/** 1 mm = 72/25,4 points PostScript. pdf-lib raisonne en points. */
export function mmToPt(mm: number): number {
  return (mm * 72) / 25.4;
}

/** Nombre de pixels nécessaires pour couvrir `mm` à 300 dpi. */
export function mmToPx(mm: number): number {
  return Math.round((mm / 25.4) * DPI);
}

/** Arrondit au multiple de 4 supérieur, sans descendre sous le minimum relié. */
export function normalizePageCount(count: number): number {
  const atLeastMinimum = Math.max(MIN_PAGES, count);
  return Math.ceil(atLeastMinimum / PAGE_MULTIPLE) * PAGE_MULTIPLE;
}

/**
 * Épaisseur du dos : (grammage / 1000 × main) × (pages / 2), puis les cartons.
 * On divise par deux car une feuille porte deux pages.
 */
export function spineWidthMm(pageCount: number, hardcover = true): number {
  const sheetThickness = (PAPER_WEIGHT / 1000) * PAPER_BULK;
  const block = sheetThickness * (pageCount / 2);
  const total = block + (hardcover ? HARDCOVER_BOARDS_MM : 0);
  return Math.round(total * 10) / 10;
}

/**
 * Une photo est-elle assez définie pour la surface qu'elle doit couvrir ?
 * En dessous de 300 dpi l'imprimeur imprime quand même, mais le résultat est
 * mou — mieux vaut le signaler avant l'envoi qu'après la facture.
 */
export function effectiveDpi(pixelWidth: number, printedWidthMm: number): number {
  if (printedWidthMm <= 0) return 0;
  return Math.round(pixelWidth / (printedWidthMm / 25.4));
}
