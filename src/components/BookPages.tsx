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
}: {
  plan: BookPlan;
  theme: BookTheme;
  photos: ViewerPhoto[];
  title: string;
  subtitle: string;
  dateLabel: string;
}) {
  const { format } = plan;

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {plan.pages.map((page) => (
        <figure key={page.number}>
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
                      src={photo.signedUrl}
                      alt={caption || "Photographie"}
                      loading="lazy"
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

          <figcaption className="mt-2 text-center text-xs text-muted-foreground">
            {page.kind === "blanche" ? "Page blanche" : "Page " + page.number}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

function pct(valueMm: number, totalMm: number): string {
  return (valueMm / totalMm) * 100 + "%";
}
