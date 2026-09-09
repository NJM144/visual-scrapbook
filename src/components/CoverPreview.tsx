import type { BookTheme, Ornament } from "@/lib/book-themes";
import type { PrintFormat } from "@/lib/print-formats";

/**
 * Aperçu de la couverture.
 *
 * C'est une maquette HTML, pas un rendu du PDF : elle sert à choisir vite un
 * thème, pas à valider le calage au millimètre. Les proportions et les couleurs
 * sont fidèles, la typographie approche celle du PDF sans l'égaler.
 */
export function CoverPreview({
  theme,
  format,
  title,
  subtitle,
  photoUrl,
}: {
  theme: BookTheme;
  format: PrintFormat;
  title: string;
  subtitle: string;
  photoUrl?: string | undefined;
}) {
  const showPhoto = theme.coverStyle !== "aplat" && Boolean(photoUrl);
  const framed = theme.coverStyle === "photo_encadree";

  return (
    <figure>
      <div
        className="relative isolate overflow-hidden rounded-r-lg rounded-l-sm shadow-xl ring-1 ring-black/10"
        style={{
          aspectRatio: format.widthMm + " / " + format.heightMm,
          backgroundColor: theme.coverBackground,
          fontFamily: theme.font === "serif" ? "var(--font-serif)" : "var(--font-sans)",
        }}
      >
        {/* Rainure de pliure, côté dos. */}
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 z-20 w-2 bg-gradient-to-r from-black/25 to-transparent"
        />

        {showPhoto && !framed ? (
          <>
            <img src={photoUrl} alt="" className="absolute inset-0 -z-10 size-full object-cover" />
            <span
              aria-hidden
              className="absolute inset-x-0 top-0 -z-10 h-[55%]"
              style={{ backgroundColor: theme.coverBackground, opacity: 0.6 }}
            />
          </>
        ) : null}

        <div className="flex h-full flex-col justify-between p-[8%]">
          <div className="text-center">
            <h3
              className="text-balance text-[clamp(1rem,4.5cqw,1.6rem)] leading-tight"
              style={{ color: theme.coverInk }}
            >
              {title}
            </h3>
            {subtitle ? (
              <p
                className="mt-2 text-[clamp(0.6rem,2.4cqw,0.8rem)] italic"
                style={{ color: theme.coverInk, opacity: 0.8 }}
              >
                {subtitle}
              </p>
            ) : null}
            <OrnamentMark kind={theme.ornament} color={theme.coverInk} />
          </div>

          {showPhoto && framed ? (
            <img
              src={photoUrl}
              alt=""
              className="mt-4 w-full flex-1 object-cover"
              style={{ maxHeight: "52%" }}
            />
          ) : null}
        </div>
      </div>

      <figcaption className="mt-3 text-center text-xs text-muted-foreground">
        {theme.label} · {format.label} · aperçu indicatif
      </figcaption>
    </figure>
  );
}

function OrnamentMark({ kind, color }: { kind: Ornament; color: string }) {
  if (kind === "aucun") return null;

  const common = { fill: "none", stroke: color, strokeWidth: 2 } as const;

  return (
    <svg viewBox="0 0 80 20" className="mx-auto mt-3 h-4 w-24" role="presentation" aria-hidden>
      {kind === "filet" ? <line x1="10" y1="10" x2="70" y2="10" {...common} /> : null}

      {kind === "soleil"
        ? Array.from({ length: 9 }, (_, i) => {
            const x = 12 + i * 7;
            const h = 4 + Math.sin((i / 8) * Math.PI) * 8;
            return <line key={i} x1={x} y1={18} x2={x} y2={18 - h} {...common} />;
          })
        : null}

      {kind === "losanges"
        ? Array.from({ length: 7 }, (_, i) => (
            <rect
              key={i}
              x={11 + i * 9.5}
              y={6}
              width={7}
              height={7}
              transform={"rotate(45 " + (14.5 + i * 9.5) + " 9.5)"}
              fill={color}
              opacity={i % 2 === 0 ? 1 : 0.45}
            />
          ))
        : null}

      {kind === "vagues" ? <path d="M8 12 q6 -7 12 0 t12 0 t12 0 t12 0 t12 0" {...common} /> : null}

      {kind === "arche" ? <path d="M14 18 A26 26 0 0 1 66 18" {...common} /> : null}
    </svg>
  );
}
