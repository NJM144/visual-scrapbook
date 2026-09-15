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
import { normalizeStickers, type PageSticker } from "./stickers";
import { isTextBlock, normalizeTextBlock, type TextBlock } from "./text-blocks";

/** Espace entre deux photos d'une même page. */
const GUTTER_MM = 5;

export type PageKind = "titre" | "photos" | "colophon" | "blanche";

export interface PhotoSlot {
  /** Rang de la photo dans l'album ; -1 quand la case n'en porte pas. */
  photoIndex: number;
  /**
   * Paragraphe occupant la case, à la place d'une photo.
   *
   * Une case porte l'un ou l'autre, jamais les deux : le texte se place et se
   * déplace exactement comme une image, puisque c'est le même découpage.
   */
  text?: TextBlock;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
}

/** Orientation des emplacements d'une page à deux ou trois photos. */
export type PageFlow = "auto" | "cote" | "pile";

/**
 * Ce qu'une page décide pour elle-même, par-dessus le thème et le livre.
 *
 * Chaque champ absent hérite : `paper` du papier du thème, `wallpaper` du
 * papier peint du livre — `null` y renonce explicitement —, `flow` de
 * l'orientation des photos.
 */
export interface PageStyle {
  paper?: string;
  wallpaper?: string | null;
  flow?: PageFlow;
  /**
   * Stickers posés sur la page, par-dessus les photos (voir stickers.ts).
   *
   * Ils appartiennent à la page et non à une case : un sticker se pose où il
   * veut, quitte à chevaucher deux photos.
   */
  stickers?: PageSticker[];
}

export const PAGE_FLOWS: PageFlow[] = ["auto", "cote", "pile"];

export interface BookPage {
  kind: PageKind;
  /** Numéro imprimé, 1 pour la première page intérieure. */
  number: number;
  slots: PhotoSlot[];
  /** Réglages propres à la page, portés jusqu'à l'écran et au PDF. */
  style?: PageStyle;
}

export interface BookPlan {
  format: PrintFormat;
  pages: BookPage[];
  /** Pages effectivement occupées, avant complément en multiple de 4. */
  usedPages: number;
  /** Pages blanches ajoutées pour l'imprimeur (voir withPrintPadding) ; 0 à l'écran. */
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

  return { format, pages, usedPages: pages.length, paddingPages: 0, photoCount };
}

/**
 * Complète le livre pour l'imprimeur : 24 pages au moins, en multiple de 4.
 *
 * Ces pages blanches ne concernent que le fichier d'impression — une reliure
 * ne sait pas faire autrement. À l'écran, l'auteur ne voit que les pages qu'il
 * a composées ; il peut en ajouter pour remplir celles-ci.
 */
export function withPrintPadding(plan: BookPlan): BookPlan {
  const usedPages = plan.pages.length;
  const total = normalizePageCount(usedPages);
  const pages = [...plan.pages];
  for (let n = usedPages; n < total; n += 1) {
    pages.push({ kind: "blanche", number: n + 1, slots: [] });
  }
  return { ...plan, pages, usedPages, paddingPages: total - usedPages };
}

/* ------------------------------------------------- disposition manuelle */

/**
 * Disposition décidée par l'auteur, telle qu'elle est stockée sur l'album.
 *
 * Une case vide (`null`) est volontaire : une page à moitié remplie est une
 * intention de mise en page, pas une erreur à combler.
 */
/**
 * Contenu d'une case : identifiant de photo, paragraphe, ou rien.
 *
 * Les albums composés avant les blocs de texte n'ont que des chaînes ; le
 * format reste donc lisible tel quel, sans conversion.
 */
export type LayoutSlot = string | TextBlock | null;

export interface AlbumLayout {
  pages: ({ id: string; slots: LayoutSlot[] } & PageStyle)[];
  /**
   * Effet appliqué à chaque photo dans ce livre, par identifiant de photo
   * (voir photo-effects.ts). L'album, lui, garde l'image d'origine : un effet
   * est une décision de mise en page, pas une retouche du fichier.
   *
   * Rangé par photo et non par case : déplacer une photo d'une page à l'autre
   * lui laisse son effet, ce qui est ce qu'on attend en la promenant.
   */
  effects?: Record<string, string>;
}

/** Les réglages de page présents, sans les clés absentes : le JSON reste net. */
export function pageStyleOf(page: PageStyle): PageStyle | undefined {
  const style: PageStyle = {};
  if (page.paper !== undefined) style.paper = page.paper;
  if (page.wallpaper !== undefined) style.wallpaper = page.wallpaper;
  if (page.flow !== undefined && page.flow !== "auto") style.flow = page.flow;
  const stickers = normalizeStickers(page.stickers);
  if (stickers) style.stickers = stickers;
  return Object.keys(style).length > 0 ? style : undefined;
}

function isPageStyle(page: PageStyle): boolean {
  if (page.paper !== undefined && !/^#[0-9a-fA-F]{6}$/.test(page.paper)) return false;
  if (
    page.wallpaper !== undefined &&
    page.wallpaper !== null &&
    typeof page.wallpaper !== "string"
  ) {
    return false;
  }
  if (page.flow !== undefined && !PAGE_FLOWS.includes(page.flow)) return false;
  if (page.stickers !== undefined && !Array.isArray(page.stickers)) return false;
  return true;
}

/** Nombre maximal de photos sur une même page. Au-delà, plus rien n'est lisible. */
export const MAX_SLOTS_PER_PAGE = 4;

export function isAlbumLayout(value: unknown): value is AlbumLayout {
  if (!value || typeof value !== "object") return false;
  const pages = (value as AlbumLayout).pages;
  if (!Array.isArray(pages)) return false;

  const effects = (value as AlbumLayout).effects;
  if (effects !== undefined && (typeof effects !== "object" || effects === null)) return false;

  return pages.every(
    (page) =>
      page &&
      typeof page.id === "string" &&
      Array.isArray(page.slots) &&
      page.slots.length >= 1 &&
      page.slots.length <= MAX_SLOTS_PER_PAGE &&
      page.slots.every((slot) => slot === null || typeof slot === "string" || isTextBlock(slot)) &&
      isPageStyle(page),
  );
}

/** Les effets d'un livre, filtrés de ce qui n'est pas exploitable. */
function readEffects(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const effects: Record<string, string> = {};
  for (const [photoId, effectId] of Object.entries(value as Record<string, unknown>)) {
    if (typeof effectId === "string" && effectId.length > 0 && effectId.length <= 24) {
      effects[photoId] = effectId;
    }
  }
  return Object.keys(effects).length > 0 ? effects : undefined;
}

/**
 * Construit une disposition modifiable à partir du découpage automatique.
 *
 * `effects` fait l'aller-retour : le studio reconstruit la disposition affichée
 * à chaque rendu, et l'oublier ici effacerait les effets à la première
 * retouche de page.
 */
export function layoutFromPlan(
  plan: BookPlan,
  photoIds: string[],
  effects?: Record<string, string> | undefined,
): AlbumLayout {
  const kept = readEffects(effects);
  return {
    ...(kept ? { effects: kept } : {}),
    pages: plan.pages
      .filter((page) => page.kind === "photos")
      .map((page, index) => ({
        id: "p" + index + "-" + page.number,
        slots: page.slots.map(
          (slot): LayoutSlot => photoIds[slot.photoIndex] ?? (slot.text ? slot.text : null),
        ),
        // Les réglages de page font l'aller-retour : les perdre ici, c'est
        // les perdre à la première retouche.
        ...(page.style ?? {}),
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

  const addPage = (entries: LayoutSlot[], style?: PageStyle) => {
    const count = Math.max(1, Math.min(MAX_SLOTS_PER_PAGE, entries.length));
    // L'auteur a le dernier mot sur l'orientation ; sinon, les photos décident.
    // Un paragraphe ne vote pas : il s'accommode de la forme qu'on lui donne.
    const bias =
      style?.flow === "cote"
        ? true
        : style?.flow === "pile"
          ? false
          : portraitMajority(
              entries
                .map((entry) =>
                  typeof entry === "string" ? (aspects[indexById.get(entry) ?? -1] ?? 0) : 0,
                )
                .filter((a) => a > 0),
            );

    const slots = buildSlots(margin, margin, boxW, boxH, count, bias).map((slot, position) => {
      const entry = entries[position] ?? null;
      if (entry && typeof entry !== "string") {
        return { ...slot, photoIndex: -1, text: normalizeTextBlock(entry) };
      }
      return { ...slot, photoIndex: indexById.get(entry ?? "") ?? -1 };
    });

    pages.push({ kind: "photos", number: pages.length + 1, slots, ...(style ? { style } : {}) });
  };

  for (const page of layout.pages) {
    // Une photo disparue de l'album laisse sa case vide ; les paragraphes,
    // eux, ne dépendent de rien et passent tels quels.
    const entries = page.slots.map((slot): LayoutSlot => {
      if (slot === null) return null;
      if (typeof slot === "string") return indexById.has(slot) ? slot : null;
      return slot;
    });
    for (const entry of entries) if (typeof entry === "string") used.add(entry);
    addPage(entries, pageStyleOf(page));
  }

  const orphans = photoIds.filter((id) => !used.has(id));
  for (let i = 0; i < orphans.length; i += 1) addPage([orphans[i] ?? null]);

  pages.push({ kind: "colophon", number: pages.length + 1, slots: [] });

  return {
    format,
    pages,
    usedPages: pages.length,
    paddingPages: 0,
    photoCount: photoIds.length,
  };
}
