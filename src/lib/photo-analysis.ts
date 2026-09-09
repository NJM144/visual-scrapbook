/**
 * Analyse des photos pour recommander un format, un thème et un cadrage.
 *
 * Tout se fait dans le navigateur, sans appel à un service externe. Les
 * questions posées ici — « quel format rogne le moins ? », « quelle palette
 * s'accorde à ces couleurs ? » — se répondent par de la mesure, pas par du
 * langage : un modèle génératif serait plus lent, payant, et surtout moins
 * fiable qu'un calcul exact sur les pixels.
 */

import { BOOK_THEMES, hexToRgb01, type BookTheme } from "./book-themes";
import { PRINT_FORMATS, type PrintFormat } from "./print-formats";
import { coverLoss } from "./photo-framing";

/** Côté de la vignette analysée. Au-delà, on paie sans rien gagner. */
const SAMPLE_SIZE = 48;

/** Quantification : 4 niveaux par canal, soit 64 cases. */
const LEVELS = 4;

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface PhotoStats {
  id: string;
  /** Largeur / hauteur. */
  aspect: number;
  width: number;
  height: number;
  /** Couleurs dominantes, de la plus fréquente à la moins fréquente. */
  colors: Rgb[];
  /** Luminance moyenne, de 0 (noir) à 1 (blanc). */
  brightness: number;
  /** Saturation moyenne, de 0 (gris) à 1. */
  saturation: number;
}

/* --------------------------------------------------------------- couleurs */

function luminance({ r, g, b }: Rgb): number {
  // Pondération perceptive : l'œil est bien plus sensible au vert qu'au bleu.
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Teinte en degrés (0–360) et saturation (0–1), depuis du RVB 0–255. */
export function toHueSaturation(color: Rgb): { hue: number; saturation: number } {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  if (delta === 0) return { hue: 0, saturation: 0 };

  let hue: number;
  if (max === r) hue = 60 * (((g - b) / delta) % 6);
  else if (max === g) hue = 60 * ((b - r) / delta + 2);
  else hue = 60 * ((r - g) / delta + 4);

  const lightness = (max + min) / 2;
  const saturation = delta / (1 - Math.abs(2 * lightness - 1) || 1);

  return { hue: (hue + 360) % 360, saturation: Math.min(1, saturation) };
}

/** Écart de teinte le plus court sur le cercle chromatique, en degrés. */
function hueDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/* ---------------------------------------------------------------- analyse */

export async function analyzePhoto(id: string, url: string): Promise<PhotoStats | null> {
  let bitmap: ImageBitmap;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    bitmap = await createImageBitmap(await response.blob(), { imageOrientation: "from-image" });
  } catch {
    return null;
  }

  try {
    const canvas = document.createElement("canvas");
    canvas.width = SAMPLE_SIZE;
    canvas.height = SAMPLE_SIZE;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;

    context.drawImage(bitmap, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const { data } = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

    const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
    let sumLuminance = 0;
    let sumSaturation = 0;
    let pixels = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      const alpha = data[i + 3] ?? 255;
      if (alpha < 128) continue;

      const key =
        (Math.floor((r / 256) * LEVELS) << 4) |
        (Math.floor((g / 256) * LEVELS) << 2) |
        Math.floor((b / 256) * LEVELS);

      const bucket = buckets.get(key);
      if (bucket) {
        bucket.count += 1;
        bucket.r += r;
        bucket.g += g;
        bucket.b += b;
      } else {
        buckets.set(key, { count: 1, r, g, b });
      }

      sumLuminance += luminance({ r, g, b });
      sumSaturation += toHueSaturation({ r, g, b }).saturation;
      pixels += 1;
    }

    if (pixels === 0) return null;

    const colors = [...buckets.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((bucket) => ({
        r: Math.round(bucket.r / bucket.count),
        g: Math.round(bucket.g / bucket.count),
        b: Math.round(bucket.b / bucket.count),
      }));

    return {
      id,
      aspect: bitmap.width / bitmap.height,
      width: bitmap.width,
      height: bitmap.height,
      colors,
      brightness: sumLuminance / pixels,
      saturation: sumSaturation / pixels,
    };
  } finally {
    bitmap.close();
  }
}

/* -------------------------------------------------------- recommandations */

export interface FormatAdvice {
  format: PrintFormat;
  /** Part moyenne d'image perdue au rognage, de 0 à 1. */
  averageLoss: number;
  reason: string;
}

/**
 * Le format qui rogne le moins.
 *
 * On mesure la perte de chaque photo cadrée en pleine page : c'est la mise en
 * page la plus exigeante, et celle qui décide de l'impression générale.
 */
export function recommendFormat(stats: PhotoStats[]): FormatAdvice[] {
  const scored = PRINT_FORMATS.map((format) => {
    const slotAspect = format.widthMm / format.heightMm;
    const losses = stats.map((photo) => coverLoss(photo.aspect, slotAspect));
    const averageLoss = losses.length
      ? losses.reduce((total, value) => total + value, 0) / losses.length
      : 0;

    return { format, averageLoss, reason: "" };
  }).sort((a, b) => a.averageLoss - b.averageLoss);

  const portraits = stats.filter((photo) => photo.aspect < 0.95).length;
  const landscapes = stats.filter((photo) => photo.aspect > 1.05).length;

  return scored.map((entry, index) => {
    const percent = Math.round(entry.averageLoss * 100);
    let reason: string;

    if (index === 0) {
      if (landscapes > portraits * 2) reason = "Vos photos sont majoritairement horizontales.";
      else if (portraits > landscapes * 2) reason = "Vos photos sont majoritairement verticales.";
      else reason = "Vos photos mêlent les orientations : le carré ménage les deux.";
      reason += " Perte moyenne au rognage : " + percent + " %.";
    } else {
      reason = percent + " % de perte moyenne au rognage.";
    }

    return { ...entry, reason };
  });
}

export interface ThemeAdvice {
  theme: BookTheme;
  score: number;
  reason: string;
}

/**
 * Le thème dont la palette s'accorde le mieux aux photos.
 *
 * Deux critères : un accent proche de la teinte dominante des photos, pour que
 * l'ensemble se tienne ; et un papier assez contrasté avec les images, sans
 * quoi les photos claires se dissolvent dans une page claire.
 */
export function recommendTheme(stats: PhotoStats[]): ThemeAdvice[] {
  if (stats.length === 0) return [];

  // Teinte dominante moyenne, calculée vectoriellement : la moyenne
  // arithmétique de 350° et 10° donnerait 180°, soit la teinte opposée.
  let sumX = 0;
  let sumY = 0;
  let weight = 0;
  for (const photo of stats) {
    for (const [index, color] of photo.colors.entries()) {
      const { hue, saturation } = toHueSaturation(color);
      const w = saturation * (photo.colors.length - index);
      sumX += Math.cos((hue * Math.PI) / 180) * w;
      sumY += Math.sin((hue * Math.PI) / 180) * w;
      weight += w;
    }
  }

  const dominantHue = weight > 0 ? ((Math.atan2(sumY, sumX) * 180) / Math.PI + 360) % 360 : 0;
  const brightness = stats.reduce((total, p) => total + p.brightness, 0) / stats.length;
  const saturation = stats.reduce((total, p) => total + p.saturation, 0) / stats.length;

  const scored = BOOK_THEMES.map((theme) => {
    const accent = hexToRgb01(theme.accent);
    const accentRgb = { r: accent.r * 255, g: accent.g * 255, b: accent.b * 255 };
    const accentHue = toHueSaturation(accentRgb).hue;

    const paper = hexToRgb01(theme.paper);
    const paperLuminance = luminance({ r: paper.r * 255, g: paper.g * 255, b: paper.b * 255 });

    // 1 quand l'accent reprend la teinte des photos, 0 à l'opposé du cercle.
    const hueScore = 1 - hueDistance(dominantHue, accentHue) / 180;
    // 1 quand le papier tranche franchement avec la luminosité des photos.
    const contrastScore = Math.min(1, Math.abs(paperLuminance - brightness) * 2.2);
    // Des photos ternes gagnent à un accent vif, des photos déjà saturées non.
    const accentSaturation = toHueSaturation(accentRgb).saturation;
    const vibranceScore = 1 - Math.abs(accentSaturation - (1 - saturation) * 0.8);

    const score = hueScore * 0.5 + contrastScore * 0.3 + vibranceScore * 0.2;
    return { theme, score, hueScore, contrastScore };
  }).sort((a, b) => b.score - a.score);

  return scored.map((entry, index) => ({
    theme: entry.theme,
    score: entry.score,
    reason:
      index === 0
        ? entry.hueScore > 0.6
          ? "Son accent reprend la teinte dominante de vos photos."
          : brightness < 0.45
            ? "Vos photos sont sombres : ce papier clair les fait ressortir."
            : "Bon équilibre entre la palette et vos couleurs."
        : Math.round(entry.score * 100) + " / 100",
  }));
}

/** Photos que le format retenu rognerait le plus, à cadrer à la main. */
export function photosNeedingAttention(
  stats: PhotoStats[],
  format: PrintFormat,
  threshold = 0.3,
): { id: string; loss: number }[] {
  const slotAspect = format.widthMm / format.heightMm;
  return stats
    .map((photo) => ({ id: photo.id, loss: coverLoss(photo.aspect, slotAspect) }))
    .filter((entry) => entry.loss >= threshold)
    .sort((a, b) => b.loss - a.loss);
}
