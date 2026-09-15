import type { BookPlan } from "@/lib/book-layout";
import type { BookTheme } from "@/lib/book-themes";
import { effectFilter } from "@/lib/photo-effects";
import { findSticker, stickerUrl } from "@/lib/stickers";
import { LINE_HEIGHT, TEXT_PADDING_MM, findTextSize } from "@/lib/text-blocks";
import type { Framing } from "@/lib/photo-framing";
import { slotKey, type SlotPosition } from "@/lib/use-slot-drag";
import { findWallpaper, wallpaperScreenUrl, type Wallpaper } from "@/lib/wallpapers";

/**
 * Le livre tel qu'il s'imprimera, page après page — et l'endroit où on le
 * modifie.
 *
 * Les emplacements viennent du même plan que le PDF : ce que l'écran montre et
 * ce que l'imprimeur reçoit ne peuvent pas diverger. Les millimètres sont
 * convertis en pourcentages de la page, ce qui rend le rendu indépendant de la
 * taille d'affichage.
 *
 * Sans la prop `edit`, le livre reste en lecture seule — c'est ainsi que le
 * voient les invités d'un album partagé.
 */

export interface ViewerPhoto {
  id: string;
  signedUrl: string;
  thumbUrl?: string | null;
  caption: string | null;
  framing: Framing;
  /** Effet du livre (voir photo-effects.ts) ; `null` = la photo telle quelle. */
  effect?: string | null;
}

/**
 * De quoi modifier le livre à même la page.
 *
 * Les pages sont désignées par leur rang parmi les pages de photos — la page
 * de titre n'en fait pas partie —, ce qui les fait correspondre une à une aux
 * pages de la disposition enregistrée.
 */
export interface BookEditControls {
  onSlotPointerDown: (event: React.PointerEvent<HTMLElement>, position: SlotPosition) => void;
  /** Case survolée pendant un glissement, case appuyée, case soulevée, case armée. */
  hoverKey: string | null;
  pressingKey: string | null;
  draggingKey: string | null;
  selectedKey: string | null;
  onInsertAfter: (photoPage: number) => void;
  onRemovePage: (photoPage: number) => void;
  /** Ajoute ou retire un emplacement sur la page. */
  onSlotCount: (photoPage: number, delta: number) => void;
  maxSlots: number;
  /** Ouvre les réglages propres à la page : couleur, papier peint, orientation. */
  onPageStyle: (photoPage: number, pageNumber: number) => void;
  /** Ouvre le choix de stickers pour cette page. */
  onStickers: (photoPage: number, pageNumber: number) => void;
  /** Début d'un geste sur un sticker posé : appui long pour le déplacer. */
  onStickerPointerDown: (
    event: React.PointerEvent<HTMLElement>,
    photoPage: number,
    index: number,
  ) => void;
  /** Sticker soulevé et sticker armé, pour les montrer comme tels. */
  draggingSticker: { page: number; index: number } | null;
  selectedSticker: { page: number; index: number } | null;
}

/** Doit rester égal à CAPTION_BAND_MM dans print-export.ts. */
export const CAPTION_BAND_MM = 7;

export function BookPages({
  plan,
  theme,
  photos,
  title,
  subtitle,
  dateLabel,
  edit,
  dpiByIndex,
  minDpi,
  wallpaper,
}: {
  plan: BookPlan;
  theme: BookTheme;
  photos: ViewerPhoto[];
  title: string;
  subtitle: string;
  dateLabel: string;
  edit?: BookEditControls | undefined;
  /**
   * Définition de chaque photo dans son emplacement, par indice. Celles qui
   * passent sous `minDpi` portent un badge : mieux vaut le voir ici que sur
   * le livre imprimé.
   */
  dpiByIndex?: ReadonlyMap<number, number> | undefined;
  minDpi?: number | undefined;
  /** Papier peint sous toutes les pages ; absent, le papier uni du thème. */
  wallpaper?: Wallpaper | null | undefined;
}) {
  const { format } = plan;

  // Rang de chaque page parmi les pages de photos, -1 pour titre et colophon.
  let seen = -1;
  const photoPageOf = plan.pages.map((page) => (page.kind === "photos" ? (seen += 1) : -1));

  return (
    /* À la lecture, le livre se feuillette d'un pouce : les pages défilent de
       côté. En édition, elles s'empilent — on déplace une photo d'une page à
       l'autre en la promenant vers le bas, et une page voisine qui serait
       hors écran, à droite, ne se laisserait jamais viser. */
    <div
      className={
        edit
          ? "grid grid-cols-1 gap-6 sm:grid-cols-2"
          : "-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:gap-6 sm:overflow-visible sm:px-0"
      }
    >
      {plan.pages.map((page, pageIndex) => {
        const photoPage = photoPageOf[pageIndex] ?? -1;
        const editable = edit && page.kind === "photos" && photoPage >= 0;
        // Ce que la page décide pour elle-même passe avant le thème et le livre.
        const paper = page.style?.paper ?? theme.paper;
        const pageWallpaper =
          page.style?.wallpaper === undefined ? wallpaper : findWallpaper(page.style.wallpaper);

        return (
          <figure
            key={page.number}
            className={edit ? "w-auto" : "w-[78vw] shrink-0 snap-center sm:w-auto"}
          >
            <div
              className="relative overflow-hidden shadow-md ring-1 ring-black/10"
              style={{
                aspectRatio: format.widthMm + " / " + format.heightMm,
                backgroundColor: paper,
                color: theme.ink,
                fontFamily: theme.font === "serif" ? "var(--font-serif)" : "var(--font-sans)",
              }}
            >
              {/* Le papier peint d'abord : tout ce qui suit se pose dessus. */}
              {pageWallpaper ? (
                <img
                  src={wallpaperScreenUrl(pageWallpaper)}
                  alt=""
                  aria-hidden
                  draggable={false}
                  loading="lazy"
                  decoding="async"
                  className="pointer-events-none absolute inset-0 size-full object-cover"
                />
              ) : null}

              {page.kind === "titre" ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center px-[10%] text-center">
                  <span className="text-balance text-[clamp(0.9rem,3.4cqw,1.4rem)] leading-tight">
                    {title}
                  </span>
                  {subtitle ? (
                    <span
                      className="mt-2 text-[clamp(0.55rem,2cqw,0.75rem)] italic"
                      style={{ color: theme.accent }}
                    >
                      {subtitle}
                    </span>
                  ) : null}
                </div>
              ) : null}

              {page.kind === "colophon" ? (
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center text-[clamp(0.5rem,1.9cqw,0.7rem)]"
                  style={{ color: theme.accent }}
                >
                  <span className="italic">{dateLabel}</span>
                  <span>{plan.photoCount} photographies</span>
                </div>
              ) : null}

              {page.slots.map((slot, slotPosition) => {
                const photo = photos[slot.photoIndex];
                const block = slot.text;
                // Une case vide n'est rien à la lecture, mais c'est là qu'on
                // dépose une photo : en édition, elle doit exister.
                if (!photo && !block && !editable) return null;

                const key = editable ? slotKey({ page: photoPage, slot: slotPosition }) : null;
                const caption = photo?.caption?.trim() ?? "";
                const dpi = photo ? dpiByIndex?.get(slot.photoIndex) : undefined;
                const soft = dpi !== undefined && minDpi !== undefined && dpi < minDpi;
                const imageHeight = caption
                  ? Math.max(10, slot.heightMm - CAPTION_BAND_MM)
                  : slot.heightMm;

                const isTarget = key !== null && edit?.hoverKey === key;
                const isPressing = key !== null && edit?.pressingKey === key;
                const isDragging = key !== null && edit?.draggingKey === key;
                const isSelected = key !== null && edit?.selectedKey === key;

                return (
                  <div
                    key={slotPosition}
                    {...(editable
                      ? {
                          "data-slot": key,
                          onPointerDown: (event: React.PointerEvent<HTMLElement>) =>
                            edit.onSlotPointerDown(event, { page: photoPage, slot: slotPosition }),
                          role: "button" as const,
                          tabIndex: 0,
                          "aria-label": photo
                            ? "Photo page " + page.number + ", appui long pour déplacer"
                            : block
                              ? "Texte page " + page.number + ", touchez pour modifier"
                              : "Emplacement vide, page " + page.number + ", touchez pour écrire",
                        }
                      : {})}
                    className={
                      "absolute transition-[transform,opacity] " +
                      (editable ? "cursor-grab touch-manipulation " : "") +
                      (isPressing ? "scale-95 " : "") +
                      (isDragging ? "opacity-30 " : "")
                    }
                    style={{
                      left: pct(slot.xMm, format.widthMm),
                      top: pct(slot.yMm, format.heightMm),
                      width: pct(slot.widthMm, format.widthMm),
                      height: pct(slot.heightMm, format.heightMm),
                    }}
                  >
                    {photo ? (
                      <>
                        <span
                          className="block overflow-hidden"
                          style={{
                            height: (imageHeight / slot.heightMm) * 100 + "%",
                            backgroundColor: paper,
                          }}
                        >
                          <img
                            src={photo.thumbUrl || photo.signedUrl}
                            // La miniature sur téléphone, l'original sur grand écran.
                            srcSet={
                              photo.thumbUrl
                                ? photo.thumbUrl + " 400w, " + photo.signedUrl + " 1400w"
                                : undefined
                            }
                            sizes="(max-width: 640px) 40vw, 45vw"
                            alt={caption || "Photographie"}
                            loading="lazy"
                            decoding="async"
                            draggable={false}
                            className={
                              "size-full" +
                              (editable ? " pointer-events-none [-webkit-touch-callout:none]" : "")
                            }
                            style={{
                              // Le même filtre que celui cuit dans le PDF.
                              filter: effectFilter(photo.effect),
                              objectFit: photo.framing.fit,
                              objectPosition:
                                photo.framing.cropX * 100 + "% " + photo.framing.cropY * 100 + "%",
                              // Même origine que le point focal : zoomer ne déplace
                              // pas le sujet que l'auteur a choisi de garder.
                              transformOrigin:
                                photo.framing.cropX * 100 + "% " + photo.framing.cropY * 100 + "%",
                              transform:
                                photo.framing.fit === "cover" && photo.framing.cropZoom > 1
                                  ? "scale(" + photo.framing.cropZoom + ")"
                                  : undefined,
                            }}
                          />
                        </span>
                        {caption ? (
                          <span
                            className="block truncate pt-[2%] text-center text-[clamp(0.4rem,1.5cqw,0.6rem)] italic"
                            style={{ color: theme.ink }}
                          >
                            {caption}
                          </span>
                        ) : null}
                      </>
                    ) : block ? (
                      /* Le paragraphe occupe la case comme le ferait une photo.
                         Sa taille est donnée en millimètres sur la page : on la
                         convertit en unités de la case, pour que l'écran montre
                         la proportion qui sera imprimée. */
                      <span
                        className="flex size-full items-center overflow-hidden"
                        style={{
                          containerType: "inline-size",
                          justifyContent: block.align === "centre" ? "center" : "flex-start",
                        }}
                      >
                        <span
                          className="block w-full whitespace-pre-wrap break-words"
                          style={{
                            fontSize: (findTextSize(block.size).mm / slot.widthMm) * 100 + "cqw",
                            lineHeight: LINE_HEIGHT,
                            padding: (TEXT_PADDING_MM / slot.widthMm) * 100 + "%",
                            textAlign: block.align === "centre" ? "center" : "left",
                            color: theme.ink,
                          }}
                        >
                          {block.text}
                        </span>
                      </span>
                    ) : (
                      <span className="flex size-full items-center justify-center rounded-[2px] border border-dashed border-black/20 text-[clamp(0.4rem,1.5cqw,0.6rem)] text-black/35">
                        {editable ? "vide — touchez pour écrire" : ""}
                      </span>
                    )}

                    {soft ? (
                      <span
                        className="pointer-events-none absolute left-[3%] top-[3%] rounded-full bg-amber-600/90 px-[1.4cqw] py-[0.5cqw] text-[clamp(0.4rem,1.4cqw,0.6rem)] font-medium leading-none text-white shadow-sm"
                        title={"Sortira floue : " + dpi + " dpi dans ce cadre"}
                      >
                        ≈ {dpi} dpi
                      </span>
                    ) : null}

                    {/* Le repère du geste : la case visée s'éclaire, la case armée
                        garde son liseré une fois le doigt levé. */}
                    {isTarget || isSelected ? (
                      <span
                        aria-hidden
                        className={
                          "pointer-events-none absolute inset-0 " +
                          (isTarget ? "bg-terre/25 ring-2 ring-terre" : "ring-2 ring-terre/70")
                        }
                      />
                    ) : null}
                  </div>
                );
              })}

              {/* Les stickers se posent après les photos : ils sont dessus, y
                  compris à cheval sur deux cases. Position et taille sont des
                  fractions de la page — elle tient en 15 comme en 30 cm. */}
              {(page.style?.stickers ?? []).map((sticker, index) => {
                const dessin = findSticker(sticker.id);
                if (!dessin) return null;
                const dragging =
                  edit?.draggingSticker?.page === photoPage && edit.draggingSticker.index === index;
                const selected =
                  edit?.selectedSticker?.page === photoPage && edit.selectedSticker.index === index;

                return (
                  <img
                    key={index}
                    src={stickerUrl(sticker.id)}
                    alt={editable ? dessin.label + ", appui long pour déplacer" : ""}
                    draggable={false}
                    loading="lazy"
                    decoding="async"
                    {...(editable
                      ? {
                          "data-sticker": index,
                          onPointerDown: (event: React.PointerEvent<HTMLElement>) =>
                            edit.onStickerPointerDown(event, photoPage, index),
                          role: "button" as const,
                          tabIndex: 0,
                        }
                      : { "aria-hidden": true })}
                    className={
                      "absolute select-none " +
                      (editable ? "cursor-grab touch-manipulation " : "pointer-events-none ") +
                      (dragging ? "opacity-30 " : "") +
                      (selected ? "outline outline-2 outline-terre " : "")
                    }
                    style={{
                      left: sticker.x * 100 + "%",
                      top: sticker.y * 100 + "%",
                      width: sticker.size * 100 + "%",
                      // La hauteur suit le dessin : c'est la page, pas la case,
                      // qui donne l'échelle des deux côtés.
                      height:
                        ((sticker.size * format.widthMm) / dessin.ratio / format.heightMm) * 100 +
                        "%",
                      transform: "translate(-50%, -50%) rotate(" + (sticker.rot ?? 0) + "deg)",
                    }}
                  />
                );
              })}

              {page.kind === "photos" &&
              page.slots.every((slot) => !photos[slot.photoIndex] && !slot.text) ? (
                <span className="absolute inset-x-0 bottom-[14%] px-[12%] text-center text-xs text-black/35">
                  {editable ? "Page vide — déposez-y une photo." : "Page vide."}
                </span>
              ) : null}

              {page.kind === "photos" ? (
                <span
                  className="absolute inset-x-0 text-center text-[clamp(0.35rem,1.3cqw,0.55rem)]"
                  style={{
                    bottom: pct(theme.photoMarginMm / 3, format.heightMm),
                    color: theme.accent,
                  }}
                >
                  {page.number}
                </span>
              ) : null}
            </div>

            <figcaption className="mt-2 flex min-h-9 flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="pl-1">
                {page.kind === "titre"
                  ? "Page de titre"
                  : page.kind === "colophon"
                    ? "Fin du livre"
                    : "Page " + page.number}
              </span>
              {editable ? (
                <span className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => edit.onPageStyle(photoPage, page.number)}
                    aria-label={"Réglages de la page " + page.number}
                    className="h-9 rounded-full border border-input px-3 text-xs text-foreground transition-colors hover:bg-muted"
                  >
                    Fond
                  </button>
                  <button
                    type="button"
                    onClick={() => edit.onStickers(photoPage, page.number)}
                    aria-label={"Stickers de la page " + page.number}
                    className="h-9 rounded-full border border-input px-3 text-xs text-foreground transition-colors hover:bg-muted"
                  >
                    Stickers
                  </button>
                  <button
                    type="button"
                    onClick={() => edit.onSlotCount(photoPage, -1)}
                    disabled={page.slots.length <= 1}
                    aria-label={"Retirer un emplacement de la page " + page.number}
                    className="size-9 rounded-full border border-input text-foreground transition-colors hover:bg-muted disabled:opacity-40"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    onClick={() => edit.onSlotCount(photoPage, 1)}
                    disabled={page.slots.length >= edit.maxSlots}
                    aria-label={"Ajouter un emplacement à la page " + page.number}
                    className="size-9 rounded-full border border-input text-foreground transition-colors hover:bg-muted disabled:opacity-40"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => edit.onInsertAfter(photoPage)}
                    className="h-9 rounded-full border border-input px-3 text-xs text-foreground transition-colors hover:bg-muted"
                  >
                    + Page après
                  </button>
                  <button
                    type="button"
                    onClick={() => edit.onRemovePage(photoPage)}
                    aria-label={"Supprimer la page " + page.number}
                    className="h-9 rounded-full border border-input px-3 text-xs text-destructive transition-colors hover:bg-destructive/10"
                  >
                    Supprimer
                  </button>
                </span>
              ) : null}
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}

function pct(valueMm: number, totalMm: number): string {
  return (valueMm / totalMm) * 100 + "%";
}
