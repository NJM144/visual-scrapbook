import type { BookPlan } from "@/lib/book-layout";
import type { BookTheme } from "@/lib/book-themes";
import type { Framing } from "@/lib/photo-framing";

/**
 * Le livre tel qu'il s'imprimera, page après page.
 *
 * Les emplacements viennent du même plan que le PDF : ce que l'écran montre et
 * ce que l'imprimeur reçoit ne peuvent pas diverger. Les millimètres sont
 * convertis en pourcentages de la page, ce qui rend le rendu indépendant de la
 * taille d'affichage.
 */

export interface ViewerPhoto {
  id: string;
  signedUrl: string;
  thumbUrl?: string | null;
  caption: string | null;
  framing: Framing;
}

/** Doit rester égal à CAPTION_BAND_MM dans print-export.ts. */
const CAPTION_BAND_MM = 7;

export function BookPages({
  plan,
  theme,
  photos,
  title,
  subtitle,
  dateLabel,
  onInsertAfter,
  onRemove,
}: {
  plan: BookPlan;
  theme: BookTheme;
  photos: ViewerPhoto[];
  title: string;
  subtitle: string;
  dateLabel: string;
  /**
   * Ajout et suppression de pages depuis l'aperçu. Les pages sont désignées
   * par leur rang parmi les pages de photos — la page de titre n'en fait pas
   * partie. Absents, l'aperçu reste en lecture seule.
   */
  onInsertAfter?: ((photoPage: number) => void) | undefined;
  onRemove?: ((photoPage: number) => void) | undefined;
}) {
  const { format } = plan;

  // Rang de chaque page parmi les pages de photos, -1 pour titre et colophon.
  let seen = -1;
  const photoPageOf = plan.pages.map((page) => (page.kind === "photos" ? (seen += 1) : -1));

  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:gap-6 sm:overflow-visible sm:px-0">
      {plan.pages.map((page, pageIndex) => (
        <figure key={page.number} className="w-[78vw] shrink-0 snap-center sm:w-auto">
          <div
            className="relative overflow-hidden shadow-md ring-1 ring-black/10"
            style={{
              aspectRatio: format.widthMm + " / " + format.heightMm,
              backgroundColor: theme.paper,
              color: theme.ink,
              fontFamily: theme.font === "serif" ? "var(--font-serif)" : "var(--font-sans)",
            }}
          >
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

            {page.slots.map((slot) => {
              const photo = photos[slot.photoIndex];
              if (!photo) return null;

              const caption = photo.caption?.trim() ?? "";
              const imageHeight = caption
                ? Math.max(10, slot.heightMm - CAPTION_BAND_MM)
                : slot.heightMm;

              return (
                <div
                  key={slot.photoIndex}
                  className="absolute"
                  style={{
                    left: pct(slot.xMm, format.widthMm),
                    top: pct(slot.yMm, format.heightMm),
                    width: pct(slot.widthMm, format.widthMm),
                    height: pct(slot.heightMm, format.heightMm),
                  }}
                >
                  <span
                    className="block overflow-hidden"
                    style={{
                      height: (imageHeight / slot.heightMm) * 100 + "%",
                      backgroundColor: theme.paper,
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
                      className="size-full"
                      style={{
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
                </div>
              );
            })}

            {page.kind === "photos" && page.slots.every((slot) => !photos[slot.photoIndex]) ? (
              <span className="absolute inset-0 flex items-center justify-center px-[12%] text-center text-xs text-black/35">
                Page vide — placez-y une photo depuis l’onglet Pages.
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

          <figcaption className="mt-2 flex min-h-9 items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="pl-1">
              {page.kind === "titre"
                ? "Page de titre"
                : page.kind === "colophon"
                  ? "Fin du livre"
                  : "Page " + page.number}
            </span>
            {page.kind === "photos" && (onInsertAfter || onRemove) ? (
              <span className="flex gap-1.5">
                {onInsertAfter ? (
                  <button
                    type="button"
                    onClick={() => onInsertAfter(photoPageOf[pageIndex] ?? 0)}
                    className="h-9 rounded-full border border-input px-3 text-xs text-foreground transition-colors hover:bg-muted"
                  >
                    + Page après
                  </button>
                ) : null}
                {onRemove ? (
                  <button
                    type="button"
                    onClick={() => onRemove(photoPageOf[pageIndex] ?? 0)}
                    aria-label={"Supprimer la page " + page.number}
                    className="h-9 rounded-full border border-input px-3 text-xs text-destructive transition-colors hover:bg-destructive/10"
                  >
                    Supprimer
                  </button>
                ) : null}
              </span>
            ) : null}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

function pct(valueMm: number, totalMm: number): string {
  return (valueMm / totalMm) * 100 + "%";
}
