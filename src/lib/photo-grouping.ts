/**
 * Regroupement automatique de photos en albums, à partir de leur date de
 * prise de vue.
 *
 * Un navigateur ne peut pas lire les albums natifs d'Android ou d'iOS : aucune
 * API web ne les expose. On reconstitue donc le découpage naturel à partir des
 * dates EXIF, ce qui retrouve en pratique les mêmes ensembles (un voyage, une
 * fête, une journée) que les albums du téléphone.
 */

import type { DateSource } from "./exif";

export type GroupingMode = "trip" | "day" | "month" | "single";

export interface DatedPhoto {
  /** Identifiant stable le temps de l'import (les File n'en ont pas). */
  id: string;
  file: File;
  takenAt: Date;
  source: DateSource;
  /** Coordonnées GPS de l'EXIF, quand l'appareil les a enregistrées. */
  latitude: number | null;
  longitude: number | null;
}

export interface PhotoGroup {
  id: string;
  title: string;
  start: Date;
  end: Date;
  photos: DatedPhoto[];
}

export interface GroupingOptions {
  mode: GroupingMode;
  /** Mode « voyage » : nombre de jours sans photo qui coupe un séjour. */
  gapDays: number;
  /** Titre utilisé en mode « album unique ». */
  singleTitle?: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const dayFormatter = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const monthFormatter = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });
const dayMonthFormatter = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });
const fullDateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Minuit local du jour de `date`, pour comparer des jours et non des instants. */
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / MS_PER_DAY);
}

function sameDay(a: Date, b: Date): boolean {
  return daysBetween(a, b) === 0;
}

/** « Samedi 12 août 2025 », « 12 – 15 août 2025 », « 28 déc. 2024 – 3 janv. 2025 ». */
export function formatRange(start: Date, end: Date): string {
  if (sameDay(start, end)) return capitalize(dayFormatter.format(start));

  if (start.getFullYear() !== end.getFullYear()) {
    return `${fullDateFormatter.format(start)} – ${fullDateFormatter.format(end)}`;
  }
  if (start.getMonth() !== end.getMonth()) {
    return capitalize(`${dayMonthFormatter.format(start)} – ${fullDateFormatter.format(end)}`);
  }
  return capitalize(`${start.getDate()} – ${fullDateFormatter.format(end)}`);
}

function buildGroup(photos: DatedPhoto[], title?: string): PhotoGroup {
  const first = photos[0];
  const last = photos[photos.length - 1];
  if (!first || !last) throw new Error("Un groupe de photos ne peut pas être vide");

  const start = first.takenAt;
  const end = last.takenAt;

  return {
    id: `${start.getTime()}-${end.getTime()}-${photos.length}`,
    title: title ?? formatRange(start, end),
    start,
    end,
    photos,
  };
}

/** Ne conserve que les photos prises dans l'intervalle demandé (bornes incluses). */
export function filterByDateRange(
  photos: DatedPhoto[],
  from: Date | null,
  to: Date | null,
): DatedPhoto[] {
  if (!from && !to) return photos;

  // Les bornes viennent d'un <input type="date"> : on raisonne en jours pleins,
  // sinon une photo prise à 18 h le dernier jour serait exclue.
  const min = from ? startOfDay(from).getTime() : Number.NEGATIVE_INFINITY;
  const max = to ? startOfDay(to).getTime() + MS_PER_DAY - 1 : Number.POSITIVE_INFINITY;

  return photos.filter((photo) => {
    const time = photo.takenAt.getTime();
    return time >= min && time <= max;
  });
}

export function groupPhotos(photos: DatedPhoto[], options: GroupingOptions): PhotoGroup[] {
  if (photos.length === 0) return [];

  const sorted = [...photos].sort((a, b) => a.takenAt.getTime() - b.takenAt.getTime());
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return [];

  if (options.mode === "single") {
    const title = options.singleTitle?.trim() || formatRange(first.takenAt, last.takenAt);
    return [buildGroup(sorted, title)];
  }

  if (options.mode === "month") {
    const buckets = new Map<string, DatedPhoto[]>();
    for (const photo of sorted) {
      const key = `${photo.takenAt.getFullYear()}-${photo.takenAt.getMonth()}`;
      const bucket = buckets.get(key);
      if (bucket) bucket.push(photo);
      else buckets.set(key, [photo]);
    }
    return [...buckets.values()].map((bucket) =>
      buildGroup(bucket, capitalize(monthFormatter.format((bucket[0] as DatedPhoto).takenAt))),
    );
  }

  // « jour » = un album par journée ; « voyage » = on coupe après gapDays sans photo.
  const maxGap = options.mode === "day" ? 0 : Math.max(0, options.gapDays);
  const groups: DatedPhoto[][] = [[first]];

  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1];
    const current = sorted[i];
    if (!previous || !current) continue;

    if (daysBetween(previous.takenAt, current.takenAt) > maxGap) groups.push([current]);
    else groups[groups.length - 1]?.push(current);
  }

  return groups.map((group) => buildGroup(group));
}

/** Bornes min/max d'une sélection, pour pré-remplir le filtre de dates. */
export function dateBounds(photos: DatedPhoto[]): { min: Date; max: Date } | null {
  if (photos.length === 0) return null;

  const first = photos[0];
  if (!first) return null;

  let min = first.takenAt;
  let max = first.takenAt;
  for (const photo of photos) {
    if (photo.takenAt < min) min = photo.takenAt;
    if (photo.takenAt > max) max = photo.takenAt;
  }
  return { min, max };
}

/** Formate une Date pour la valeur d'un <input type="date"> (sans décalage UTC). */
export function toDateInputValue(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Lit la valeur d'un <input type="date"> comme une date locale, pas UTC. */
export function fromDateInputValue(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}
