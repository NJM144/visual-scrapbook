/**
 * Modèles de couverture.
 *
 * Le thème donne les couleurs et la typographie ; le modèle donne la
 * composition. Les séparer multiplie les possibilités — dix thèmes et sept
 * modèles font soixante-dix couvertures — sans multiplier la configuration.
 *
 * Les motifs sont décrits une seule fois, en chemins SVG dans un carré de
 * 100 × 100. L'aperçu HTML les pose dans un <svg>, et `drawSvgPath` de pdf-lib
 * les accepte tels quels : un seul tracé, deux rendus, aucun risque de voir
 * l'écran diverger de l'imprimé.
 */

import type { BookTheme, Ornament } from "./book-themes";

export type MotifId = "feuillage" | "soleil" | "arche" | "vagues" | "losanges" | "pois";

export type CoverKind =
  /** La photo occupe toute la couverture, le titre par-dessus. */
  | "photo_pleine"
  /** Aplat, photo posée avec de larges marges. */
  | "photo_encadree"
  /** Aplat, grand motif au centre, photo en encart bordé de blanc. */
  | "encart"
  /** Aplat, grande silhouette en filigrane, petite photo dans un angle. */
  | "icone"
  /** Motif répété sur toute la surface, titre sur une plaque centrale. */
  | "motif_repete"
  /** Photo en haut, bandeau de couleur en bas portant le titre. */
  | "bandeau"
  /** Aucune photo : le titre seul, en grand. */
  | "typographique";

export interface CoverTemplate {
  id: string;
  label: string;
  description: string;
  kind: CoverKind;
  /** Motif employé quand le thème n'en impose pas de pertinent. */
  fallbackMotif: MotifId;
  needsPhoto: boolean;
}

export const COVER_TEMPLATES: CoverTemplate[] = [
  {
    id: "photo_pleine",
    label: "Photo pleine page",
    description: "La photo occupe toute la couverture, le titre par-dessus.",
    kind: "photo_pleine",
    fallbackMotif: "soleil",
    needsPhoto: true,
  },
  {
    id: "photo_encadree",
    label: "Photo encadrée",
    description: "La photo posée sur un aplat, avec de larges marges.",
    kind: "photo_encadree",
    fallbackMotif: "pois",
    needsPhoto: true,
  },
  {
    id: "encart",
    label: "Encart",
    description: "Grand motif en fond, photo en encart bordé de blanc. Style carnet de voyage.",
    kind: "encart",
    fallbackMotif: "soleil",
    needsPhoto: true,
  },
  {
    id: "icone",
    label: "Icône",
    description: "Une grande silhouette en filigrane, la photo glissée dans un angle.",
    kind: "icone",
    fallbackMotif: "arche",
    needsPhoto: true,
  },
  {
    id: "motif_repete",
    label: "Motif répété",
    description: "Un motif sur toute la couverture, le titre sur une plaque. Façon papier peint.",
    kind: "motif_repete",
    fallbackMotif: "feuillage",
    needsPhoto: false,
  },
  {
    id: "bandeau",
    label: "Bandeau",
    description: "La photo en haut, un bandeau de couleur en bas pour le titre.",
    kind: "bandeau",
    fallbackMotif: "vagues",
    needsPhoto: true,
  },
  {
    id: "typographique",
    label: "Typographique",
    description: "Pas de photo. Le titre seul, en grand, et un filet.",
    kind: "typographique",
    fallbackMotif: "losanges",
    needsPhoto: false,
  },
];

export const DEFAULT_COVER_TEMPLATE = "photo_pleine";

export function findCoverTemplate(id: string | null | undefined): CoverTemplate {
  return (
    COVER_TEMPLATES.find((template) => template.id === id) ??
    (COVER_TEMPLATES.find((t) => t.id === DEFAULT_COVER_TEMPLATE) as CoverTemplate)
  );
}

/** Ornements de thème qui se traduisent en motif de couverture. */
const ORNAMENT_TO_MOTIF: Partial<Record<Ornament, MotifId>> = {
  soleil: "soleil",
  losanges: "losanges",
  vagues: "vagues",
  arche: "arche",
};

/**
 * Motif retenu : celui du thème s'il en porte un, sinon celui du modèle.
 *
 * « filet » et « aucun » ne donnent rien à répéter ni à agrandir — dans ces
 * cas le modèle impose le sien, faute de quoi une couverture « motif répété »
 * sortirait vide.
 */
export function resolveMotif(template: CoverTemplate, theme: BookTheme): MotifId {
  return ORNAMENT_TO_MOTIF[theme.ornament] ?? template.fallbackMotif;
}

/* ------------------------------------------------------------------ tracés */

/** Chemin SVG du motif, dans un carré de 100 × 100, origine en haut à gauche. */
export function motifPath(id: MotifId): string {
  switch (id) {
    case "feuillage":
      // Une tige, quatre feuilles alternées, un bouton au sommet.
      return [
        "M50 98 L50 26",
        "M50 82 C28 78 22 60 46 60",
        "M50 66 C72 62 78 44 54 44",
        "M50 50 C28 46 22 28 46 28",
        "M50 26 m-9 0 a9 9 0 1 0 18 0 a9 9 0 1 0 -18 0",
      ].join(" ");

    case "soleil": {
      // Rayons en pointe autour d'un disque, comme sur les couvertures de voyage.
      const rays: string[] = [];
      const count = 16;
      for (let i = 0; i < count; i += 1) {
        const angle = (i / count) * Math.PI * 2;
        const spread = Math.PI / count / 1.6;
        const point = (radius: number, a: number) =>
          (50 + Math.cos(a) * radius).toFixed(2) + " " + (50 + Math.sin(a) * radius).toFixed(2);
        rays.push(
          "M" +
            point(22, angle - spread) +
            " L" +
            point(50, angle) +
            " L" +
            point(22, angle + spread) +
            " Z",
        );
      }
      rays.push("M50 50 m-20 0 a20 20 0 1 0 40 0 a20 20 0 1 0 -40 0");
      return rays.join(" ");
    }

    case "arche":
      // Coupole sur son socle : la silhouette d'un village méditerranéen.
      return "M14 96 L14 56 A36 36 0 0 1 86 56 L86 96 Z M50 20 L50 8 M44 14 L56 14";

    case "vagues":
      return [
        "M0 30 q12 -14 25 0 t25 0 t25 0 t25 0",
        "M0 55 q12 -14 25 0 t25 0 t25 0 t25 0",
        "M0 80 q12 -14 25 0 t25 0 t25 0 t25 0",
      ].join(" ");

    case "losanges":
      return [
        "M50 10 L74 50 L50 90 L26 50 Z",
        "M50 30 L62 50 L50 70 L38 50 Z",
        "M8 50 L18 40 L28 50 L18 60 Z",
        "M92 50 L82 40 L72 50 L82 60 Z",
      ].join(" ");

    case "pois":
    default: {
      const dots: string[] = [];
      for (let row = 0; row < 3; row += 1) {
        for (let column = 0; column < 3; column += 1) {
          const x = 20 + column * 30;
          const y = 20 + row * 30;
          const r = (row + column) % 2 === 0 ? 7 : 4;
          dots.push(
            "M" +
              x +
              " " +
              y +
              " m-" +
              r +
              " 0 a" +
              r +
              " " +
              r +
              " 0 1 0 " +
              r * 2 +
              " 0 a" +
              r +
              " " +
              r +
              " 0 1 0 -" +
              r * 2 +
              " 0",
          );
        }
      }
      return dots.join(" ");
    }
  }
}

/** Les motifs pleins se remplissent ; les linéaires se tracent au filet. */
export function motifIsFilled(id: MotifId): boolean {
  return id === "soleil" || id === "losanges" || id === "pois" || id === "arche";
}

/** Pas de la tuile, en fraction de la largeur, pour le modèle « motif répété ». */
export const TILE_COLUMNS = 4;
