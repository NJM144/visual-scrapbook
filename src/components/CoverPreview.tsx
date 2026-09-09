import type { BookTheme } from "@/lib/book-themes";
import type { PrintFormat } from "@/lib/print-formats";
import {
  TILE_COLUMNS,
  findCoverTemplate,
  motifIsFilled,
  motifPath,
  resolveMotif,
  type CoverTemplate,
} from "@/lib/cover-templates";

/**
 * Aperçu de la couverture.
 *
 * C'est une maquette : les proportions et les couleurs sont fidèles, la
 * typographie approche celle du PDF sans l'égaler. Les motifs, eux, sont les
 * tracés exacts que recevra l'imprimeur — ils viennent du même module.
 */
export function CoverPreview({
  theme,
  format,
  title,
  subtitle,
  photoUrl,
  templateId,
}: {
  theme: BookTheme;
  format: PrintFormat;
  title: string;
  subtitle: string;
  photoUrl?: string | undefined;
  templateId?: string | undefined;
}) {
  const template = findCoverTemplate(templateId);
  const motif = resolveMotif(template, theme);
  const hasPhoto = Boolean(photoUrl) && template.needsPhoto;

  return (
    <figure>
      <div
        className="relative isolate overflow-hidden rounded-l-sm rounded-r-lg shadow-xl ring-1 ring-black/10"
        style={{
          aspectRatio: format.widthMm + " / " + format.heightMm,
          backgroundColor:
            template.kind === "photo_pleine" ? theme.coverBackground : theme.coverBackground,
          fontFamily: theme.font === "serif" ? "var(--font-serif)" : "var(--font-sans)",
          // Indispensable pour que les unités cqw ci-dessous aient un référent.
          containerType: "inline-size",
        }}
      >
        {/* Rainure de pliure, côté dos. */}
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 z-30 w-2 bg-gradient-to-r from-black/25 to-transparent"
        />

        <Composition
          template={template}
          theme={theme}
          motif={motif}
          title={title}
          subtitle={subtitle}
          photoUrl={hasPhoto ? photoUrl : undefined}
        />
      </div>

      <figcaption className="mt-3 text-center text-xs text-muted-foreground">
        {template.label} · {theme.label} · {format.label}
      </figcaption>
    </figure>
  );
}

function Motif({
  motif,
  color,
  opacity = 1,
  className,
  style,
}: {
  motif: string;
  color: string;
  opacity?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const filled = motifIsFilled(motif as never);
  return (
    <svg viewBox="0 0 100 100" className={className} style={style} aria-hidden role="presentation">
      <path
        d={motifPath(motif as never)}
        fill={filled ? color : "none"}
        stroke={filled ? "none" : color}
        strokeWidth={3}
        strokeLinecap="round"
        opacity={opacity}
      />
    </svg>
  );
}

function Title({
  title,
  subtitle,
  color,
  size = "3.9cqw",
  caps = false,
}: {
  title: string;
  subtitle: string;
  color: string;
  size?: string;
  caps?: boolean;
}) {
  return (
    <>
      <span
        className="block text-balance leading-tight"
        style={{
          color,
          fontSize: "clamp(0.85rem, " + size + ", 2.2rem)",
          textTransform: caps ? "uppercase" : "none",
          letterSpacing: caps ? "0.12em" : "normal",
        }}
      >
        {title}
      </span>
      {subtitle ? (
        <span
          className="mt-[2%] block italic"
          style={{ color, opacity: 0.85, fontSize: "clamp(0.55rem, 2.1cqw, 0.85rem)" }}
        >
          {subtitle}
        </span>
      ) : null}
    </>
  );
}

function Composition({
  template,
  theme,
  motif,
  title,
  subtitle,
  photoUrl,
}: {
  template: CoverTemplate;
  theme: BookTheme;
  motif: string;
  title: string;
  subtitle: string;
  photoUrl?: string | undefined;
}) {
  const ink = theme.coverInk;

  if (template.kind === "photo_pleine") {
    return (
      <>
        {photoUrl ? (
          <img src={photoUrl} alt="" className="absolute inset-0 -z-10 size-full object-cover" />
        ) : null}
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 -z-10 h-[55%]"
          style={{ backgroundColor: theme.coverBackground, opacity: 0.62 }}
        />
        <div className="absolute inset-x-0 top-0 p-[8%] text-center">
          <Title title={title} subtitle={subtitle} color={ink} />
          <Motif motif={motif} color={ink} className="mx-auto mt-[4%] w-[22%]" opacity={0.9} />
        </div>
      </>
    );
  }

  if (template.kind === "photo_encadree") {
    return (
      <div className="flex h-full flex-col p-[9%]">
        <div className="text-center">
          <Title title={title} subtitle={subtitle} color={ink} />
        </div>
        {photoUrl ? (
          <img
            src={photoUrl}
            alt=""
            className="mt-[6%] w-full flex-1 object-cover"
            style={{ maxHeight: "58%" }}
          />
        ) : null}
        <Motif motif={motif} color={ink} className="mx-auto mt-[5%] w-[18%]" opacity={0.75} />
      </div>
    );
  }

  if (template.kind === "encart") {
    return (
      <>
        <Motif
          motif={motif}
          color={ink}
          opacity={0.9}
          className="absolute left-1/2 top-[46%] w-[78%] -translate-x-1/2 -translate-y-1/2"
        />
        <div className="absolute inset-x-0 top-[9%] px-[8%] text-center">
          <Title title={title} subtitle="" color={ink} size="5.2cqw" caps />
        </div>
        {photoUrl ? (
          <div className="absolute left-1/2 top-[46%] w-[46%] -translate-x-1/2 -translate-y-1/2 bg-white p-[4%] pb-[12%] shadow-lg">
            <img src={photoUrl} alt="" className="aspect-square w-full object-cover" />
          </div>
        ) : null}
        {subtitle ? (
          <span
            className="absolute inset-x-0 bottom-[8%] text-center italic"
            style={{ color: ink, opacity: 0.85, fontSize: "clamp(0.5rem, 2cqw, 0.8rem)" }}
          >
            {subtitle}
          </span>
        ) : null}
      </>
    );
  }

  if (template.kind === "icone") {
    return (
      <>
        {/* Silhouette en filigrane : présente, mais elle ne dispute pas le titre. */}
        <Motif
          motif={motif}
          color={ink}
          opacity={0.16}
          className="absolute left-1/2 top-[52%] w-[92%] -translate-x-1/2 -translate-y-1/2"
        />
        <div className="absolute inset-x-0 top-[8%] px-[8%]">
          <Title title={title} subtitle={subtitle} color={ink} size="6cqw" caps />
        </div>
        {photoUrl ? (
          <img
            src={photoUrl}
            alt=""
            className="absolute bottom-[8%] right-[8%] aspect-[4/3] w-[38%] object-cover shadow-md"
          />
        ) : null}
      </>
    );
  }

  if (template.kind === "motif_repete") {
    const tiles = TILE_COLUMNS * (TILE_COLUMNS + 2);
    return (
      <>
        <div
          aria-hidden
          className="absolute inset-0 grid"
          style={{ gridTemplateColumns: "repeat(" + TILE_COLUMNS + ", 1fr)" }}
        >
          {Array.from({ length: tiles }, (_, index) => (
            <Motif
              key={index}
              motif={motif}
              color={ink}
              opacity={0.85}
              className="size-full p-[8%]"
              style={{ transform: index % 2 === 0 ? "none" : "rotate(180deg)" }}
            />
          ))}
        </div>
        {/* Plaque centrale : sans elle, le titre se perdrait dans le motif. */}
        <div
          className="absolute left-1/2 top-1/2 w-[62%] -translate-x-1/2 -translate-y-1/2 px-[6%] py-[7%] text-center"
          style={{ backgroundColor: theme.paper, outline: "1px solid " + ink }}
        >
          <Title title={title} subtitle={subtitle} color={theme.ink} size="3.4cqw" />
        </div>
      </>
    );
  }

  if (template.kind === "bandeau") {
    return (
      <>
        {photoUrl ? (
          <img
            src={photoUrl}
            alt=""
            className="absolute inset-x-0 top-0 h-[62%] w-full object-cover"
          />
        ) : null}
        <div
          className="absolute inset-x-0 bottom-0 h-[38%] px-[8%] py-[5%]"
          style={{ backgroundColor: theme.coverBackground }}
        >
          <Title title={title} subtitle={subtitle} color={ink} />
          <Motif motif={motif} color={ink} className="mt-[3%] w-[16%]" opacity={0.8} />
        </div>
      </>
    );
  }

  // Typographique
  return (
    <div className="flex h-full flex-col items-center justify-center px-[10%] text-center">
      <Motif motif={motif} color={ink} className="w-[16%]" opacity={0.8} />
      <div className="my-[6%] w-[40%]" style={{ borderTop: "1px solid " + ink, opacity: 0.5 }} />
      <Title title={title} subtitle={subtitle} color={ink} size="6.5cqw" />
    </div>
  );
}
