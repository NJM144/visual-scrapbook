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

/**
 * Découpe en `parts` bandes.
 *
 * L'axe de coupe suit l'orientation des photos, pas celle de la boîte : deux
 * photos verticales côte à côte gardent presque tout leur cadre, empilées elles
 * perdent la moitié de leur hauteur.
 */
function splitForOrientation(
  x: number,
  y: number,
  width: number,
  height: number,
  parts: number,
  portraitBias: boolean | null,
): PhotoSlot[] {
  // Des photos verticales veulent des bandes verticales, donc une coupe
  // horizontale. À défaut d'information, on coupe le plus grand côté.
  const horizontal = portraitBias === null ? width >= height : portraitBias;
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
  portraitBias: boolean | null,
): PhotoSlot[] {
  if (count <= 1) return [{ photoIndex: -1, xMm: x, yMm: y, widthMm: width, heightMm: height }];
  if (count === 2) return splitForOrientation(x, y, width, height, 2, portraitBias);

  if (count === 3) {
    // Une grande photo sur deux tiers, deux petites sur le tiers restant.
    const horizontal = portraitBias === null ? width >= height : portraitBias;
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

    return [large, ...splitForOrientation(restX, restY, restW, restH, 2, !horizontal)];
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

/** Majorité de photos verticales ? `null` si l'information manque. */
function portraitMajority(aspects: number[]): boolean | null {
  const known = aspects.filter((value) => Number.isFinite(value) && value > 0);
  if (known.length === 0) return null;

  const portraits = known.filter((value) => value < 1).length;
  return portraits * 2 >= known.length;
}

/**
 * @param aspects Rapport largeur/hauteur de chaque photo, dans l'ordre du
 * livre. Une valeur absente ou nulle fait retomber la page sur un découpage
 * neutre plutôt que de fausser l'orientation.
 */
export function planBook(
  aspects: number[],
  formatId: string | null | undefined,
  theme: BookTheme,
): BookPlan {
  const photoCount = aspects.length;
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
    const bias = portraitMajority(aspects.slice(placed, placed + count));

    const slots = buildSlots(boxX, boxY, boxW, boxH, count, bias).map((slot, index) => ({
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

/* ------------------------------------------------- disposition manuelle */

/**
 * Disposition décidée par l'auteur, telle qu'elle est stockée sur l'album.
 *
 * Une case vide (`null`) est volontaire : une page à moitié remplie est une
 * intention de mise en page, pas une erreur à combler.
 */
export interface AlbumLayout {
  pages: { id: string; slots: (string | null)[] }[];
}

/** Nombre maximal de photos sur une même page. Au-delà, plus rien n'est lisible. */
export const MAX_SLOTS_PER_PAGE = 4;

export function isAlbumLayout(value: unknown): value is AlbumLayout {
  if (!value || typeof value !== "object") return false;
  const pages = (value as AlbumLayout).pages;
  if (!Array.isArray(pages)) return false;

  return pages.every(
    (page) =>
      page &&
      typeof page.id === "string" &&
      Array.isArray(page.slots) &&
      page.slots.length >= 1 &&
      page.slots.length <= MAX_SLOTS_PER_PAGE &&
      page.slots.every((slot) => slot === null || typeof slot === "string"),
  );
}

/** Construit une disposition modifiable à partir du découpage automatique. */
export function layoutFromPlan(plan: BookPlan, photoIds: string[]): AlbumLayout {
  return {
    pages: plan.pages
      .filter((page) => page.kind === "photos")
      .map((page, index) => ({
        id: "p" + index + "-" + page.number,
        slots: page.slots.map((slot) => photoIds[slot.photoIndex] ?? null),
      })),
  };
}

/**
 * Compose le livre à partir d'une disposition manuelle.
 *
 * Même géométrie que le mode automatique : seul le regroupement change. Les
 * photos absentes de la disposition — ajoutées après coup — sont ajoutées à la
 * suite, faute de quoi elles disparaîtraient du livre sans prévenir.
 */
export function planFromLayout(
  layout: AlbumLayout,
  photoIds: string[],
  aspects: number[],
  formatId: string | null | undefined,
  theme: BookTheme,
): BookPlan {
  const format = findFormat(formatId);
  const margin = theme.photoMarginMm;
  const boxW = format.widthMm - margin * 2;
  const boxH = format.heightMm - margin * 2;

  const indexById = new Map(photoIds.map((id, index) => [id, index]));
  const used = new Set<string>();
  const pages: BookPage[] = [{ kind: "titre", number: 1, slots: [] }];

  const addPage = (ids: (string | null)[]) => {
    const count = Math.max(1, Math.min(MAX_SLOTS_PER_PAGE, ids.length));
    const bias = portraitMajority(
      ids.map((id) => (id ? (aspects[indexById.get(id) ?? -1] ?? 0) : 0)).filter((a) => a > 0),
    );

    const slots = buildSlots(margin, margin, boxW, boxH, count, bias).map((slot, position) => ({
      ...slot,
      photoIndex: indexById.get(ids[position] ?? "") ?? -1,
    }));

    pages.push({ kind: "photos", number: pages.length + 1, slots });
  };

  for (const page of layout.pages) {
    const ids = page.slots.map((id) => (id && indexById.has(id) ? id : null));
    for (const id of ids) if (id) used.add(id);
    addPage(ids);
  }

  const orphans = photoIds.filter((id) => !used.has(id));
  for (let i = 0; i < orphans.length; i += 1) addPage([orphans[i] ?? null]);

  pages.push({ kind: "colophon", number: pages.length + 1, slots: [] });

  const usedPages = pages.length;
  const total = normalizePageCount(usedPages);
  for (let n = usedPages; n < total; n += 1) {
    pages.push({ kind: "blanche", number: n + 1, slots: [] });
  }

  return { format, pages, usedPages, paddingPages: total - usedPages, photoCount: photoIds.length };
}
