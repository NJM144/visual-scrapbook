/**
 * Cadrage d'une photo dans son emplacement.
 *
 * Ce module est la seule source de vérité du recadrage : l'aperçu à l'écran et
 * le PDF appellent tous deux `computePlacement`. Dupliquer ce calcul, c'est
 * garantir qu'un jour l'écran montrera autre chose que ce qui sera imprimé.
 */

export type FitMode = "cover" | "contain";

export interface Framing {
  /** Point de l'image maintenu au centre, en fraction de la largeur (0 à 1). */
  cropX: number;
  /** Idem, en fraction de la hauteur. */
  cropY: number;
  /** 1 = cadrage couvrant strict ; au-delà, on zoome dans la photo. */
  cropZoom: number;
  fit: FitMode;
}

export const DEFAULT_FRAMING: Framing = {
  cropX: 0.5,
  cropY: 0.5,
  cropZoom: 1,
  fit: "cover",
};

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

/** Région de l'image source à prélever, en pixels. */
export interface SourceRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export interface Placement {
  source: SourceRect;
  /** Destination dans l'emplacement, dans l'unité de l'emplacement. */
  dx: number;
  dy: number;
  dw: number;
  dh: number;
  /** Part de l'image perdue au rognage, de 0 à 1. */
  loss: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeFraming(input: Partial<Framing> | null | undefined): Framing {
  return {
    cropX: clamp(input?.cropX ?? DEFAULT_FRAMING.cropX, 0, 1),
    cropY: clamp(input?.cropY ?? DEFAULT_FRAMING.cropY, 0, 1),
    cropZoom: clamp(input?.cropZoom ?? DEFAULT_FRAMING.cropZoom, MIN_ZOOM, MAX_ZOOM),
    fit: input?.fit === "contain" ? "contain" : "cover",
  };
}

/**
 * Où prélever dans l'image, et où la poser dans l'emplacement.
 *
 * En mode « contain » le zoom est ignoré : montrer la photo entière et zoomer
 * dedans sont deux intentions contradictoires.
 */
export function computePlacement(
  imageWidth: number,
  imageHeight: number,
  slotWidth: number,
  slotHeight: number,
  framing: Framing,
): Placement {
  if (imageWidth <= 0 || imageHeight <= 0 || slotWidth <= 0 || slotHeight <= 0) {
    return {
      source: { sx: 0, sy: 0, sw: 1, sh: 1 },
      dx: 0,
      dy: 0,
      dw: slotWidth,
      dh: slotHeight,
      loss: 0,
    };
  }

  if (framing.fit === "contain") {
    const scale = Math.min(slotWidth / imageWidth, slotHeight / imageHeight);
    const dw = imageWidth * scale;
    const dh = imageHeight * scale;
    return {
      source: { sx: 0, sy: 0, sw: imageWidth, sh: imageHeight },
      dx: (slotWidth - dw) / 2,
      dy: (slotHeight - dh) / 2,
      dw,
      dh,
      loss: 0,
    };
  }

  const scale = Math.max(slotWidth / imageWidth, slotHeight / imageHeight) * framing.cropZoom;
  const sw = Math.min(imageWidth, slotWidth / scale);
  const sh = Math.min(imageHeight, slotHeight / scale);

  // Le point focal glisse dans ce qui reste de marge : à zoom 1 sur l'axe déjà
  // ajusté, la marge est nulle et le curseur n'a aucun effet — c'est correct,
  // il n'y a rien à choisir sur cet axe.
  const sx = clamp(framing.cropX * (imageWidth - sw), 0, Math.max(0, imageWidth - sw));
  const sy = clamp(framing.cropY * (imageHeight - sh), 0, Math.max(0, imageHeight - sh));

  return {
    source: { sx, sy, sw, sh },
    dx: 0,
    dy: 0,
    dw: slotWidth,
    dh: slotHeight,
    loss: 1 - (sw * sh) / (imageWidth * imageHeight),
  };
}

/**
 * Traduction du cadrage en propriétés CSS, pour l'aperçu.
 *
 * `object-position` prend le point focal en pourcentage, et le zoom passe par
 * une mise à l'échelle : c'est l'équivalent exact du prélèvement fait au canvas
 * dans le PDF.
 */
export function framingToStyle(framing: Framing): {
  objectFit: FitMode;
  objectPosition: string;
  transform: string;
} {
  return {
    objectFit: framing.fit,
    objectPosition: framing.cropX * 100 + "% " + framing.cropY * 100 + "%",
    transform:
      framing.fit === "cover" && framing.cropZoom > 1 ? "scale(" + framing.cropZoom + ")" : "none",
  };
}

/** Part de l'image perdue si on la cadre en « couvrant » dans ce rapport. */
export function coverLoss(imageAspect: number, slotAspect: number): number {
  if (imageAspect <= 0 || slotAspect <= 0) return 0;
  const ratio = imageAspect > slotAspect ? slotAspect / imageAspect : imageAspect / slotAspect;
  return 1 - ratio;
}
