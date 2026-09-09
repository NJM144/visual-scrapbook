/**
 * Thèmes graphiques du livre imprimé.
 *
 * Un thème décide de tout ce qui n'est pas la photo : couleur du papier, encre,
 * accent, typographie, traitement de la couverture et motif décoratif. Les
 * couleurs sont en hexadécimal parce qu'elles servent deux fois — à l'aperçu
 * HTML et au PDF, où pdf-lib les veut en composantes 0–1.
 */

export type ThemeFont = "serif" | "sans";

/** Traitement de la couverture. */
export type CoverStyle =
  /** La photo occupe toute la couverture, le titre par-dessus. */
  | "photo_pleine"
  /** La photo est encadrée par une large marge de papier. */
  | "photo_encadree"
  /** Aucune photo : un aplat de couleur et le titre. */
  | "aplat";

/** Motif dessiné sur la couverture, en vectoriel. */
export type Ornament = "aucun" | "filet" | "soleil" | "losanges" | "vagues" | "arche";

export interface BookTheme {
  id: string;
  label: string;
  description: string;
  /** Fond des pages intérieures. */
  paper: string;
  /** Couleur du texte. */
  ink: string;
  /** Couleur des filets, numéros de page et motifs. */
  accent: string;
  /** Fond de la couverture, sous la photo ou seul. */
  coverBackground: string;
  /** Couleur du texte de couverture. */
  coverInk: string;
  font: ThemeFont;
  coverStyle: CoverStyle;
  ornament: Ornament;
  /** Marge blanche autour des photos intérieures, en mm. 0 = bord perdu. */
  photoMarginMm: number;
}

export const BOOK_THEMES: BookTheme[] = [
  {
    id: "savane",
    label: "Savane",
    description: "Terracotta et or de fin de journée. Chaleureux, un peu solennel.",
    paper: "#FBF5EC",
    ink: "#3A2418",
    accent: "#B8562F",
    coverBackground: "#3A2418",
    coverInk: "#FBF5EC",
    font: "serif",
    coverStyle: "photo_pleine",
    ornament: "soleil",
    photoMarginMm: 10,
  },
  {
    id: "ivoire",
    label: "Ivoire",
    description: "Blanc cassé, larges marges. La photo parle seule.",
    paper: "#FFFFFF",
    ink: "#1F1F1F",
    accent: "#9A9A9A",
    coverBackground: "#FFFFFF",
    coverInk: "#1F1F1F",
    font: "serif",
    coverStyle: "photo_encadree",
    ornament: "filet",
    photoMarginMm: 14,
  },
  {
    id: "encre",
    label: "Encre",
    description: "Noir profond, sans fioriture. Les couleurs ressortent violemment.",
    paper: "#141414",
    ink: "#F2F2F2",
    accent: "#8C8C8C",
    coverBackground: "#000000",
    coverInk: "#FFFFFF",
    font: "sans",
    coverStyle: "photo_pleine",
    ornament: "aucun",
    photoMarginMm: 8,
  },
  {
    id: "kente",
    label: "Kente",
    description: "Losanges et couleurs franches, inspirés du tissage.",
    paper: "#FFF8E7",
    ink: "#1E2A23",
    accent: "#C9A227",
    coverBackground: "#1E5B3A",
    coverInk: "#FFF8E7",
    font: "sans",
    coverStyle: "photo_encadree",
    ornament: "losanges",
    photoMarginMm: 12,
  },
  {
    id: "lagune",
    label: "Lagune",
    description: "Bleus et verts d’eau. Pour la mer, la pluie, les voyages.",
    paper: "#F2F8F7",
    ink: "#16323A",
    accent: "#2E8B8B",
    coverBackground: "#16323A",
    coverInk: "#F2F8F7",
    font: "serif",
    coverStyle: "photo_pleine",
    ornament: "vagues",
    photoMarginMm: 10,
  },
  {
    id: "harmattan",
    label: "Harmattan",
    description: "Sable et poussière. Doux, presque délavé.",
    paper: "#F6EFE3",
    ink: "#4A4034",
    accent: "#C2A377",
    coverBackground: "#C2A377",
    coverInk: "#3A3228",
    font: "sans",
    coverStyle: "photo_encadree",
    ornament: "arche",
    photoMarginMm: 12,
  },
  {
    id: "bogolan",
    label: "Bogolan",
    description: "Brun terre et noir, motifs géométriques du tissu bogolan.",
    paper: "#EFE6D8",
    ink: "#241A12",
    accent: "#7A4A2B",
    coverBackground: "#241A12",
    coverInk: "#EFE6D8",
    font: "sans",
    coverStyle: "aplat",
    ornament: "losanges",
    photoMarginMm: 10,
  },
  {
    id: "hibiscus",
    label: "Hibiscus",
    description: "Rouge vif et rose. Fêtes, mariages, anniversaires.",
    paper: "#FFF4F2",
    ink: "#3D1218",
    accent: "#C2264B",
    coverBackground: "#C2264B",
    coverInk: "#FFF4F2",
    font: "serif",
    coverStyle: "photo_pleine",
    ornament: "soleil",
    photoMarginMm: 10,
  },
  {
    id: "kraft",
    label: "Kraft",
    description: "Papier recyclé, encre brune. Simple et artisanal.",
    paper: "#E8DCC8",
    ink: "#3B2F22",
    accent: "#8A6E4B",
    coverBackground: "#B79B72",
    coverInk: "#2E241A",
    font: "sans",
    coverStyle: "photo_encadree",
    ornament: "filet",
    photoMarginMm: 12,
  },
  {
    id: "nocturne",
    label: "Nocturne",
    description: "Bleu nuit rehaussé d’or. Le plus habillé de la série.",
    paper: "#F4F3EF",
    ink: "#141B33",
    accent: "#C1A14E",
    coverBackground: "#141B33",
    coverInk: "#EFE3C2",
    font: "serif",
    coverStyle: "photo_pleine",
    ornament: "arche",
    photoMarginMm: 12,
  },
];

export const DEFAULT_THEME_ID = "savane";

export function findTheme(id: string | null | undefined): BookTheme {
  return (
    BOOK_THEMES.find((theme) => theme.id === id) ??
    (BOOK_THEMES.find((theme) => theme.id === DEFAULT_THEME_ID) as BookTheme)
  );
}

/** Convertit "#B8562F" en composantes 0–1, la forme attendue par pdf-lib. */
export function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;

  return {
    r: parseInt(full.slice(0, 2), 16) / 255,
    g: parseInt(full.slice(2, 4), 16) / 255,
    b: parseInt(full.slice(4, 6), 16) / 255,
  };
}
