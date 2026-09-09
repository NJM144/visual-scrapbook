/**
 * Composition du livre : répartition des photos en pages et calcul des
 * emplacements, en millimètres, dans la zone imprimable.
 *
 * Tout est exprimé en millimètres et dans un repère « origine en haut à
 * gauche », comme on lit une page. La conversion vers le repère PDF (origine
 * en bas) se fait au moment du tracé, pas ici.
 */

import { findFormat, normalizePageCount, type PrintFormat } from "./print-formats";
import type { BookTheme } from "./book-themes";

/** Espace entre deux photos d'une même page. */
const GUTTER_MM = 5;

export type PageKind = "titre" | "photos" | "colophon" | "blanche";

export interface PhotoSlot {
  /** Rang de la photo dans l'album. */
  photoIndex: number;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
}

export interface BookPage {
  kind: PageKind;
  /** Numéro imprimé, 1 pour la première page intérieure. */
  number: number;
  slots: PhotoSlot[];
}

export interface BookPlan {
  format: PrintFormat;
  pages: BookPage[];
  /** Pages effectivement occupées, avant complément en multiple de 4. */
  usedPages: number;
  /** Pages blanches ajoutées pour atteindre le multiple de 4. */
  paddingPages: number;
  photoCount: number;
}

/**
 * Rythme des pages : une pleine page pour respirer, puis des pages plus
 * denses. Un livre où chaque page est identique est vite ennuyeux.
 */
const RHYTHM: number[] = [1, 2, 1, 3, 2, 4, 1, 2];

function splitAlongLongestAxis(
  x: number,
  y: number,
  width: number,
  height: number,
  parts: number,
): PhotoSlot[] {
  const horizontal = width >= height;
  const total = horizontal ? width : height;
  const each = (total - GUTTER_MM * (parts - 1)) / parts;

  return Array.from({ length: parts }, (_, index) => {
    const offset = index * (each + GUTTER_MM);
    return {
      photoIndex: -1,
      xMm: horizontal ? x + offset : x,
      yMm: horizontal ? y : y + offset,
      widthMm: horizontal ? each : width,
      heightMm: horizontal ? height : each,
    };
  });
}

/** Découpe la zone imprimable en `count` emplacements (1 à 4). */
function buildSlots(
  x: number,
  y: number,
  width: number,
  height: number,
  count: number,
): PhotoSlot[] {
  if (count <= 1) return [{ photoIndex: -1, xMm: x, yMm: y, widthMm: width, heightMm: height }];
  if (count === 2) return splitAlongLongestAxis(x, y, width, height, 2);

  if (count === 3) {
    // Une grande photo sur deux tiers, deux petites sur le tiers restant.
    const horizontal = width >= height;
    const major = ((horizontal ? width : height) - GUTTER_MM) * (2 / 3);
    const minor = (horizontal ? width : height) - GUTTER_MM - major;

    const large: PhotoSlot = {
      photoIndex: -1,
      xMm: x,
      yMm: y,
      widthMm: horizontal ? major : width,
      heightMm: horizontal ? height : major,
    };
    const restX = horizontal ? x + major + GUTTER_MM : x;
    const restY = horizontal ? y : y + major + GUTTER_MM;
    const restW = horizontal ? minor : width;
    const restH = horizontal ? height : minor;

    return [large, ...splitAlongLongestAxis(restX, restY, restW, restH, 2)];
  }

  // Quatre photos : grille 2 × 2.
  const cellW = (width - GUTTER_MM) / 2;
  const cellH = (height - GUTTER_MM) / 2;
  return [
    { photoIndex: -1, xMm: x, yMm: y, widthMm: cellW, heightMm: cellH },
    { photoIndex: -1, xMm: x + cellW + GUTTER_MM, yMm: y, widthMm: cellW, heightMm: cellH },
    { photoIndex: -1, xMm: x, yMm: y + cellH + GUTTER_MM, widthMm: cellW, heightMm: cellH },
    {
      photoIndex: -1,
      xMm: x + cellW + GUTTER_MM,
      yMm: y + cellH + GUTTER_MM,
      widthMm: cellW,
      heightMm: cellH,
    },
  ];
}

export function planBook(
  photoCount: number,
  formatId: string | null | undefined,
  theme: BookTheme,
): BookPlan {
  const format = findFormat(formatId);
  const margin = theme.photoMarginMm;
  const boxX = margin;
  const boxY = margin;
  const boxW = format.widthMm - margin * 2;
  const boxH = format.heightMm - margin * 2;

  const pages: BookPage[] = [{ kind: "titre", number: 1, slots: [] }];

  let placed = 0;
  let rhythmStep = 0;
  while (placed < photoCount) {
    const wanted = RHYTHM[rhythmStep % RHYTHM.length] ?? 1;
    const count = Math.min(wanted, photoCount - placed);

    const slots = buildSlots(boxX, boxY, boxW, boxH, count).map((slot, index) => ({
      ...slot,
      photoIndex: placed + index,
    }));

    pages.push({ kind: "photos", number: pages.length + 1, slots });
    placed += count;
    rhythmStep += 1;
  }

  pages.push({ kind: "colophon", number: pages.length + 1, slots: [] });

  const usedPages = pages.length;
  const total = normalizePageCount(usedPages);
  for (let n = usedPages; n < total; n += 1) {
    pages.push({ kind: "blanche", number: n + 1, slots: [] });
  }

  return {
    format,
    pages,
    usedPages,
    paddingPages: total - usedPages,
    photoCount,
  };
}
