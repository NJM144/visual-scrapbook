/**
 * Génération des fichiers d'impression.
 *
 * Deux PDF séparés, comme le demandent les imprimeries : l'intérieur d'un côté,
 * la couverture de l'autre (elle porte le dos, dont la largeur dépend du nombre
 * de pages). Chaque page fait la taille rognée + 3 mm de fond perdu + une marge
 * portant les traits de coupe, et déclare ses boîtes TrimBox / BleedBox pour que
 * le prépresse sache où couper sans avoir à mesurer.
 *
 * Les images sont ré-échantillonnées à exactement 300 dpi pour la surface
 * qu'elles couvrent : embarquer un cliché de 12 Mpx dans une vignette de 4 cm
 * ne fait que gonfler le fichier.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { strToU8, zipSync } from "fflate";
import { BLEED_MM, effectiveDpi, mmToPt, mmToPx, spineWidthMm } from "./print-formats";
import { hexToRgb01, type BookTheme } from "./book-themes";
import type { BookPlan } from "./book-layout";

/** Marge extérieure portant les traits de coupe, au-delà du fond perdu. */
const MARKS_MM = 8;

/** Longueur d'un trait de coupe. */
const MARK_LENGTH_MM = 5;

const JPEG_QUALITY = 0.92;

/** Hauteur réservée sous une photo légendée. */
const CAPTION_BAND_MM = 7;

export interface ExportPhoto {
  id: string;
  /** URL signée, lisible par le navigateur. */
  url: string;
  /** Légende imprimée sous l'image. */
  caption?: string | null;
}

export interface ExportMeta {
  title: string;
  subtitle: string;
  /** Date affichée au colophon. */
  dateLabel: string;
}

export interface ExportResult {
  /** Archive contenant l'intérieur, la couverture et la fiche technique. */
  archive: Blob;
  /** Fiche technique, également incluse dans l'archive. */
  spec: string;
  /** Photos trop peu définies pour la surface qu'elles occupent. */
  warnings: string[];
}

function color(hex: string) {
  const { r, g, b } = hexToRgb01(hex);
  return rgb(r, g, b);
}

/* ------------------------------------------------------------------ images */

type Rendered = { bytes: Uint8Array; sourceWidth: number };

const renderCache = new Map<string, ImageBitmap>();

async function loadBitmap(url: string): Promise<ImageBitmap> {
  const cached = renderCache.get(url);
  if (cached) return cached;

  const response = await fetch(url);
  if (!response.ok) throw new Error("Photo illisible (" + response.status + ")");

  const bitmap = await createImageBitmap(await response.blob(), {
    imageOrientation: "from-image",
  });
  renderCache.set(url, bitmap);
  return bitmap;
}

/**
 * Recadre la photo pour remplir exactement l'emplacement, à 300 dpi.
 *
 * Le recadrage est fait au canvas plutôt qu'avec un masque PDF : c'est le seul
 * moyen de garantir la résolution du fichier final, et ça évite de transporter
 * des pixels qui seront de toute façon coupés.
 */
async function renderSlot(url: string, widthMm: number, heightMm: number): Promise<Rendered> {
  const bitmap = await loadBitmap(url);
  const targetW = Math.max(1, mmToPx(widthMm));
  const targetH = Math.max(1, mmToPx(heightMm));

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas indisponible");

  context.imageSmoothingQuality = "high";

  // Cadrage « couvrant » : on remplit sans déformer, quitte à rogner.
  const scale = Math.max(targetW / bitmap.width, targetH / bitmap.height);
  const drawW = bitmap.width * scale;
  const drawH = bitmap.height * scale;
  context.drawImage(bitmap, (targetW - drawW) / 2, (targetH - drawH) / 2, drawW, drawH);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) throw new Error("Encodage JPEG impossible");

  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    sourceWidth: bitmap.width,
  };
}

/* ------------------------------------------------------------------- pages */

interface Sheet {
  page: PDFPage;
  /** Décalage du coin haut-gauche de la zone rognée, en points. */
  offsetPt: number;
  trimWidthPt: number;
  trimHeightPt: number;
  heightPt: number;
}

/** Crée une page au format rogné + fond perdu + marge de repérage. */
function addSheet(pdf: PDFDocument, trimWidthMm: number, trimHeightMm: number): Sheet {
  const outer = BLEED_MM + MARKS_MM;
  const widthPt = mmToPt(trimWidthMm + outer * 2);
  const heightPt = mmToPt(trimHeightMm + outer * 2);
  const page = pdf.addPage([widthPt, heightPt]);

  const offsetPt = mmToPt(outer);
  const trimWidthPt = mmToPt(trimWidthMm);
  const trimHeightPt = mmToPt(trimHeightMm);
  const bleedPt = mmToPt(MARKS_MM);

  page.setMediaBox(0, 0, widthPt, heightPt);
  page.setBleedBox(bleedPt, bleedPt, widthPt - bleedPt * 2, heightPt - bleedPt * 2);
  page.setTrimBox(offsetPt, offsetPt, trimWidthPt, trimHeightPt);

  return { page, offsetPt, trimWidthPt, trimHeightPt, heightPt };
}

/** Repère haut-gauche (millimètres) → repère PDF bas-gauche (points). */
function place(sheet: Sheet, xMm: number, yMm: number, widthMm: number, heightMm: number) {
  const w = mmToPt(widthMm);
  const h = mmToPt(heightMm);
  return {
    x: sheet.offsetPt + mmToPt(xMm),
    y: sheet.heightPt - sheet.offsetPt - mmToPt(yMm) - h,
    width: w,
    height: h,
  };
}

/** Fond couvrant la zone rognée et son fond perdu. */
function paintBackground(sheet: Sheet, hex: string) {
  const bleed = mmToPt(BLEED_MM);
  sheet.page.drawRectangle({
    x: sheet.offsetPt - bleed,
    y: sheet.heightPt - sheet.offsetPt - sheet.trimHeightPt - bleed,
    width: sheet.trimWidthPt + bleed * 2,
    height: sheet.trimHeightPt + bleed * 2,
    color: color(hex),
  });
}

/** Traits de coupe aux quatre angles, hors du fond perdu. */
function drawCropMarks(sheet: Sheet) {
  const ink = rgb(0, 0, 0);
  const thickness = 0.25;
  const gap = mmToPt(BLEED_MM);
  const len = mmToPt(MARK_LENGTH_MM);

  const left = sheet.offsetPt;
  const right = sheet.offsetPt + sheet.trimWidthPt;
  const bottom = sheet.heightPt - sheet.offsetPt - sheet.trimHeightPt;
  const top = sheet.heightPt - sheet.offsetPt;

  const segments: { x: number; y: number; w: number; h: number }[] = [];
  for (const x of [left, right]) {
    segments.push({ x, y: bottom - gap - len, w: 0, h: len });
    segments.push({ x, y: top + gap, w: 0, h: len });
  }
  for (const y of [bottom, top]) {
    segments.push({ x: left - gap - len, y, w: len, h: 0 });
    segments.push({ x: right + gap, y, w: len, h: 0 });
  }

  for (const s of segments) {
    sheet.page.drawLine({
      start: { x: s.x, y: s.y },
      end: { x: s.x + s.w, y: s.y + s.h },
      thickness,
      color: ink,
    });
  }
}

/* --------------------------------------------------------------- ornements */

function drawOrnament(sheet: Sheet, theme: BookTheme, centerXMm: number, yMm: number) {
  const ink = color(theme.coverInk);
  const width = 40;

  if (theme.ornament === "aucun") return;

  if (theme.ornament === "filet") {
    const p = place(sheet, centerXMm - width / 2, yMm, width, 0.6);
    sheet.page.drawRectangle({ ...p, color: ink });
    return;
  }

  if (theme.ornament === "soleil") {
    const rays = 9;
    for (let i = 0; i < rays; i += 1) {
      const t = i / (rays - 1);
      const x = centerXMm - width / 2 + t * width;
      const height = 3 + Math.sin(t * Math.PI) * 7;
      const p = place(sheet, x, yMm + (10 - height), 0.9, height);
      sheet.page.drawRectangle({ ...p, color: ink });
    }
    return;
  }

  if (theme.ornament === "losanges") {
    const count = 7;
    const size = 4;
    for (let i = 0; i < count; i += 1) {
      const x = centerXMm - width / 2 + (i * width) / (count - 1);
      const p = place(sheet, x - size / 2, yMm, size, size);
      sheet.page.drawRectangle({
        ...p,
        color: ink,
        rotate: { type: "degrees", angle: 45 } as never,
        opacity: i % 2 === 0 ? 1 : 0.45,
      });
    }
    return;
  }

  if (theme.ornament === "vagues") {
    const steps = 40;
    for (let i = 0; i < steps; i += 1) {
      const t = i / (steps - 1);
      const x = centerXMm - width / 2 + t * width;
      const y = yMm + 4 + Math.sin(t * Math.PI * 3) * 3;
      const p = place(sheet, x, y, 1.2, 1.2);
      sheet.page.drawRectangle({ ...p, color: ink });
    }
    return;
  }

  // Arche : deux montants et une série de points formant le demi-cercle.
  const radius = width / 2;
  for (let i = 0; i <= 24; i += 1) {
    const angle = (Math.PI * i) / 24;
    const x = centerXMm + Math.cos(angle) * radius;
    const y = yMm + 8 - Math.sin(angle) * radius * 0.55;
    const p = place(sheet, x - 0.5, y, 1, 1);
    sheet.page.drawRectangle({ ...p, color: ink });
  }
}

/* ------------------------------------------------------------------ textes */

function drawCentered(
  sheet: Sheet,
  text: string,
  font: PDFFont,
  sizePt: number,
  yMm: number,
  trimWidthMm: number,
  hex: string,
) {
  if (!text) return;
  const width = font.widthOfTextAtSize(text, sizePt);
  const xMm = (trimWidthMm - (width / 72) * 25.4) / 2;
  const p = place(sheet, xMm, yMm, 0, 0);
  sheet.page.drawText(text, { x: p.x, y: p.y, size: sizePt, font, color: color(hex) });
}

/** Coupe un titre trop long pour la largeur disponible. */
function fitText(text: string, font: PDFFont, sizePt: number, maxWidthPt: number): string {
  if (font.widthOfTextAtSize(text, sizePt) <= maxWidthPt) return text;
  let cut = text;
  while (cut.length > 4 && font.widthOfTextAtSize(cut + "…", sizePt) > maxWidthPt) {
    cut = cut.slice(0, -1);
  }
  return cut + "…";
}

/* ------------------------------------------------------------------ export */

export interface ExportOptions {
  plan: BookPlan;
  theme: BookTheme;
  photos: ExportPhoto[];
  meta: ExportMeta;
  /** Photo de couverture ; la première de l'album par défaut. */
  coverPhoto?: ExportPhoto | undefined;
  onProgress?: (done: number, total: number, label: string) => void;
}

export async function exportBook(options: ExportOptions): Promise<ExportResult> {
  const { plan, theme, photos, meta, coverPhoto, onProgress } = options;
  const format = plan.format;
  const warnings: string[] = [];

  const totalSteps = plan.photoCount + 2;
  let step = 0;
  const tick = (label: string) => {
    step += 1;
    onProgress?.(step, totalSteps, label);
  };

  /* ---- intérieur ---- */
  const interior = await PDFDocument.create();
  interior.setTitle(meta.title);
  interior.setSubject("Intérieur — " + format.label);
  interior.setCreator("Anthologie");

  const serif = await interior.embedFont(StandardFonts.TimesRoman);
  const serifItalic = await interior.embedFont(StandardFonts.TimesRomanItalic);
  const sans = await interior.embedFont(StandardFonts.Helvetica);
  const body = theme.font === "serif" ? serif : sans;
  const italic = theme.font === "serif" ? serifItalic : sans;

  for (const bookPage of plan.pages) {
    const sheet = addSheet(interior, format.widthMm, format.heightMm);
    paintBackground(sheet, theme.paper);
    drawCropMarks(sheet);

    if (bookPage.kind === "titre") {
      drawCentered(
        sheet,
        fitText(meta.title, body, 26, mmToPt(format.widthMm - 30)),
        body,
        26,
        format.heightMm * 0.42,
        format.widthMm,
        theme.ink,
      );
      if (meta.subtitle) {
        drawCentered(
          sheet,
          fitText(meta.subtitle, italic, 12, mmToPt(format.widthMm - 30)),
          italic,
          12,
          format.heightMm * 0.42 + 12,
          format.widthMm,
          theme.accent,
        );
      }
    } else if (bookPage.kind === "colophon") {
      drawCentered(
        sheet,
        meta.dateLabel,
        italic,
        10,
        format.heightMm * 0.5,
        format.widthMm,
        theme.accent,
      );
      drawCentered(
        sheet,
        plan.photoCount + " photographies",
        body,
        9,
        format.heightMm * 0.5 + 8,
        format.widthMm,
        theme.accent,
      );
    }

    for (const slot of bookPage.slots) {
      const photo = photos[slot.photoIndex];
      if (!photo) continue;

      // Une photo légendée cède le bas de son emplacement au texte, plutôt que
      // de laisser la légende déborder sur la photo voisine.
      const caption = photo.caption?.trim() ?? "";
      const imageHeight = caption ? Math.max(10, slot.heightMm - CAPTION_BAND_MM) : slot.heightMm;

      const rendered = await renderSlot(photo.url, slot.widthMm, imageHeight);
      const image = await interior.embedJpg(rendered.bytes);
      sheet.page.drawImage(image, place(sheet, slot.xMm, slot.yMm, slot.widthMm, imageHeight));

      if (caption) {
        const size = 7.5;
        const text = fitText(caption, italic, size, mmToPt(slot.widthMm));
        const textWidthMm = (italic.widthOfTextAtSize(text, size) / 72) * 25.4;
        const p = place(
          sheet,
          slot.xMm + (slot.widthMm - textWidthMm) / 2,
          slot.yMm + imageHeight + CAPTION_BAND_MM - 2.2,
          0,
          0,
        );
        sheet.page.drawText(text, { x: p.x, y: p.y, size, font: italic, color: color(theme.ink) });
      }

      const dpi = effectiveDpi(rendered.sourceWidth, slot.widthMm);
      if (dpi < 240) {
        warnings.push(
          "Photo " +
            (slot.photoIndex + 1) +
            " : " +
            dpi +
            " dpi sur " +
            Math.round(slot.widthMm) +
            " mm de large (300 dpi recommandés).",
        );
      }
      tick("Photo " + (slot.photoIndex + 1) + " / " + plan.photoCount);
    }

    // Folio, sauf sur les pages liminaires.
    if (bookPage.kind === "photos") {
      drawCentered(
        sheet,
        String(bookPage.number),
        sans,
        8,
        format.heightMm - theme.photoMarginMm / 2 - 1,
        format.widthMm,
        theme.accent,
      );
    }
  }

  const interiorBytes = await interior.save();
  tick("Assemblage de l’intérieur");

  /* ---- couverture ---- */
  const spine = spineWidthMm(plan.pages.length, true);
  const coverWidth = format.widthMm * 2 + spine;

  const cover = await PDFDocument.create();
  cover.setTitle(meta.title + " — couverture");
  cover.setSubject("Couverture — dos " + spine + " mm");
  cover.setCreator("Anthologie");

  const coverSerif = await cover.embedFont(StandardFonts.TimesRoman);
  const coverSerifItalic = await cover.embedFont(StandardFonts.TimesRomanItalic);
  const coverSans = await cover.embedFont(StandardFonts.Helvetica);
  const coverBody = theme.font === "serif" ? coverSerif : coverSans;
  const coverItalic = theme.font === "serif" ? coverSerifItalic : coverSans;

  const sheet = addSheet(cover, coverWidth, format.heightMm);
  paintBackground(sheet, theme.coverBackground);
  drawCropMarks(sheet);

  // Le plat recto occupe la moitié droite : dos au centre, dos de couverture à
  // gauche, comme le livre se présente une fois relié et mis à plat.
  const frontX = format.widthMm + spine;
  const photo = coverPhoto ?? photos[0];

  if (photo && theme.coverStyle !== "aplat") {
    if (theme.coverStyle === "photo_pleine") {
      // Débordement de 3 mm sur les bords extérieurs, pas côté dos.
      const rendered = await renderSlot(
        photo.url,
        format.widthMm + BLEED_MM,
        format.heightMm + BLEED_MM * 2,
      );
      const image = await cover.embedJpg(rendered.bytes);
      sheet.page.drawImage(
        image,
        place(sheet, frontX, -BLEED_MM, format.widthMm + BLEED_MM, format.heightMm + BLEED_MM * 2),
      );
      // Voile sombre pour que le titre reste lisible sur n'importe quelle photo.
      sheet.page.drawRectangle({
        ...place(sheet, frontX, format.heightMm * 0.45, format.widthMm, format.heightMm * 0.55),
        color: color(theme.coverBackground),
        opacity: 0.6,
      });
    } else {
      const inset = 18;
      const rendered = await renderSlot(
        photo.url,
        format.widthMm - inset * 2,
        format.heightMm * 0.52,
      );
      const image = await cover.embedJpg(rendered.bytes);
      sheet.page.drawImage(
        image,
        place(sheet, frontX + inset, inset, format.widthMm - inset * 2, format.heightMm * 0.52),
      );
    }
  }

  const titleSize = format.widthMm > 250 ? 34 : 24;
  const titleY =
    theme.coverStyle === "photo_encadree" ? format.heightMm * 0.68 : format.heightMm * 0.72;
  const maxTitlePt = mmToPt(format.widthMm - 30);

  {
    const text = fitText(meta.title, coverBody, titleSize, maxTitlePt);
    const width = coverBody.widthOfTextAtSize(text, titleSize);
    const xMm = frontX + (format.widthMm - (width / 72) * 25.4) / 2;
    const p = place(sheet, xMm, titleY, 0, 0);
    sheet.page.drawText(text, {
      x: p.x,
      y: p.y,
      size: titleSize,
      font: coverBody,
      color: color(theme.coverInk),
    });
  }

  if (meta.subtitle) {
    const text = fitText(meta.subtitle, coverItalic, 12, maxTitlePt);
    const width = coverItalic.widthOfTextAtSize(text, 12);
    const xMm = frontX + (format.widthMm - (width / 72) * 25.4) / 2;
    const p = place(sheet, xMm, titleY + 10, 0, 0);
    sheet.page.drawText(text, {
      x: p.x,
      y: p.y,
      size: 12,
      font: coverItalic,
      color: color(theme.coverInk),
    });
  }

  drawOrnament(sheet, theme, frontX + format.widthMm / 2, titleY + 20);

  // Titre au dos, seulement si le dos est assez large pour rester lisible.
  if (spine >= 8) {
    const text = fitText(meta.title, coverBody, 10, mmToPt(format.heightMm - 40));
    const p = place(sheet, format.widthMm + spine / 2, format.heightMm / 2, 0, 0);
    sheet.page.drawText(text, {
      x: p.x + 3,
      y: p.y - coverBody.widthOfTextAtSize(text, 10) / 2,
      size: 10,
      font: coverBody,
      color: color(theme.coverInk),
      rotate: { type: "degrees", angle: 90 } as never,
    });
  }

  const coverBytes = await cover.save();
  tick("Assemblage de la couverture");

  const spec = buildSpecSheet(plan, theme, spine, meta, warnings);

  // Un seul fichier à télécharger : trois `click()` successifs sur un lien de
  // téléchargement, les navigateurs n'en honorent que le premier.
  // Niveau 0 (rangement sans compression) : les PDF le sont déjà.
  const archive = zipSync(
    {
      "interieur.pdf": interiorBytes,
      "couverture.pdf": coverBytes,
      "fiche-technique.txt": strToU8(spec),
    },
    { level: 0 },
  );

  return {
    archive: new Blob([archive as unknown as BlobPart], { type: "application/zip" }),
    spec,
    warnings,
  };
}

/** Fiche à remettre à l'imprimeur avec les deux PDF. */
function buildSpecSheet(
  plan: BookPlan,
  theme: BookTheme,
  spineMm: number,
  meta: ExportMeta,
  warnings: string[],
): string {
  const f = plan.format;
  const lines = [
    "FICHE TECHNIQUE D'IMPRESSION",
    "===========================",
    "",
    "Ouvrage      : " + meta.title,
    "Thème        : " + theme.label,
    "Date         : " + meta.dateLabel,
    "",
    "FORMAT",
    "  Format fini      : " + f.widthMm + " x " + f.heightMm + " mm (" + f.label + ")",
    "  Fond perdu       : " + BLEED_MM + " mm sur chaque bord",
    "  Marge de securite: 5 mm depuis la coupe",
    "  Traits de coupe  : presents, hors fond perdu",
    "  Boites PDF       : TrimBox et BleedBox definies",
    "",
    "INTERIEUR  (fichier interieur.pdf)",
    "  Pages            : " + plan.pages.length + " (multiple de 4)",
    "  dont blanches    : " + plan.paddingPages,
    "  Photographies    : " + plan.photoCount,
    "  Resolution       : 300 dpi a taille reelle",
    "",
    "COUVERTURE (fichier couverture.pdf)",
    "  Planche          : dos de couverture + dos + plat recto, en un seul tenant",
    "  Largeur du dos   : " + spineMm + " mm",
    "  Calcul du dos    : (170 g/m2 / 1000 x main 1) x (" +
      plan.pages.length +
      " / 2) + 5 mm de cartons",
    "  Reliure prevue   : dos carre colle, couverture rigide",
    "",
    "COLORIMETRIE",
    "  Espace du fichier: RVB (sRGB)",
    "  Conversion CMJN  : a realiser par l'imprimeur",
    "  Profil conseille : FOGRA39 / ISO Coated v2",
    "  Les PDF ne sont PAS conformes PDF/X-1a : ils sont generes par un",
    "  navigateur, qui ne sait pas produire de CMJN. Merci de convertir.",
    "",
  ];

  if (warnings.length > 0) {
    lines.push("POINTS DE VIGILANCE", ...warnings.map((w) => "  - " + w), "");
  } else {
    lines.push("POINTS DE VIGILANCE", "  Aucun : toutes les photos depassent 240 dpi.", "");
  }

  return lines.join("\n");
}

/** Libère les images gardées en cache entre deux exports. */
export function releaseExportCache() {
  for (const bitmap of renderCache.values()) bitmap.close();
  renderCache.clear();
}
