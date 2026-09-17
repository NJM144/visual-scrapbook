import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_FRAMING, MAX_ZOOM, MIN_ZOOM, type Framing } from "@/lib/photo-framing";

/**
 * Cadrage manuel d'une photo dans son emplacement.
 *
 * L'image est posée en dimensions explicites dans un cadre qui déborde, plutôt
 * qu'avec `object-fit` : c'est exactement le calcul fait au canvas pour le PDF,
 * donc ce qu'on déplace ici est ce qui sera imprimé — et le glisser-déposer
 * devient une simple soustraction.
 */
export function PhotoFramer({
  url,
  slotAspect,
  framing,
  paperColor,
  onChange,
  effect,
  maxHeight,
  part = "all",
}: {
  url: string;
  /** Rapport largeur/hauteur de l'emplacement à remplir. */
  slotAspect: number;
  framing: Framing;
  paperColor: string;
  onChange: (framing: Framing) => void;
  /** Filtre CSS de l'effet du livre : on cadre ce qui sera imprimé. */
  effect?: string | undefined;
  /**
   * Hauteur maximale du cadre (unité CSS). Sur un téléphone, un cadre vertical
   * pleine largeur remplirait l'écran et pousserait les réglages hors de vue.
   */
  maxHeight?: string | undefined;
  /**
   * Le cadre seul, les réglages seuls, ou les deux. Le panneau de photo pose le
   * cadre en haut, là où l'œil reste, et les réglages sous les onglets : les
   * deux parties partagent le même cadrage, puisqu'il vient des props.
   */
  part?: "all" | "frame" | "controls";
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;

    const measure = () =>
      setFrameSize({ width: element.clientWidth, height: element.clientHeight });
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const ready = frameSize.width > 0 && natural.width > 0;

  // Dimensions affichées et débordement, identiques au prélèvement du PDF.
  let renderedWidth = frameSize.width;
  let renderedHeight = frameSize.height;
  if (ready) {
    if (framing.fit === "contain") {
      const scale = Math.min(frameSize.width / natural.width, frameSize.height / natural.height);
      renderedWidth = natural.width * scale;
      renderedHeight = natural.height * scale;
    } else {
      const scale =
        Math.max(frameSize.width / natural.width, frameSize.height / natural.height) *
        framing.cropZoom;
      renderedWidth = natural.width * scale;
      renderedHeight = natural.height * scale;
    }
  }

  const overflowX = Math.max(0, renderedWidth - frameSize.width);
  const overflowY = Math.max(0, renderedHeight - frameSize.height);
  const movable = framing.fit === "cover" && (overflowX > 1 || overflowY > 1);

  const left =
    framing.fit === "contain" ? (frameSize.width - renderedWidth) / 2 : -framing.cropX * overflowX;
  const top =
    framing.fit === "contain"
      ? (frameSize.height - renderedHeight) / 2
      : -framing.cropY * overflowY;

  const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!movable) return;
    dragRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = dragRef.current;
    if (!start) return;

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    dragRef.current = { x: event.clientX, y: event.clientY };

    onChange({
      ...framing,
      cropX: overflowX > 0 ? clamp01(framing.cropX - dx / overflowX) : framing.cropX,
      cropY: overflowY > 0 ? clamp01(framing.cropY - dy / overflowY) : framing.cropY,
    });
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (framing.fit !== "cover") return;
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, framing.cropZoom - event.deltaY * 0.002));
      onChange({ ...framing, cropZoom: Number(next.toFixed(2)) });
    },
    [framing, onChange],
  );

  const showFrame = part !== "controls";
  const showControls = part !== "frame";

  return (
    <div>
      {showFrame ? (
        <div
          ref={frameRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onWheel={handleWheel}
          className={
            "relative w-full touch-none select-none overflow-hidden rounded-xl ring-1 ring-black/10 " +
            (movable ? "cursor-move" : "cursor-default")
          }
          style={{
            aspectRatio: String(slotAspect),
            backgroundColor: paperColor,
            ...(maxHeight
              ? {
                  width: "min(100%, calc(" + maxHeight + " * " + slotAspect + "))",
                  marginInline: "auto",
                }
              : {}),
          }}
        >
          <img
            src={url}
            alt=""
            draggable={false}
            onLoad={(event) =>
              setNatural({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })
            }
            className="absolute max-w-none"
            style={{
              left: left + "px",
              top: top + "px",
              width: renderedWidth + "px",
              height: renderedHeight + "px",
              filter: effect,
            }}
          />

          {/* Repère du tiers : aide à placer un sujet sans le centrer bêtement. */}
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <span className="absolute inset-y-0 left-1/3 w-px bg-white/25" />
            <span className="absolute inset-y-0 left-2/3 w-px bg-white/25" />
            <span className="absolute inset-x-0 top-1/3 h-px bg-white/25" />
            <span className="absolute inset-x-0 top-2/3 h-px bg-white/25" />
          </div>
        </div>
      ) : null}

      {showControls ? (
        <>
          <p className={(showFrame ? "mt-2 " : "") + "text-xs text-muted-foreground"}>
            {/* Réglages seuls : le cadre et ses mesures vivent dans l'aperçu,
                cette partie ne sait donc pas si la photo déborde. Elle renvoie
                vers l'aperçu plutôt que d'affirmer à tort « rien à déplacer ». */}
            {framing.fit === "contain"
              ? "Photo entière : rien n’est coupé, des marges apparaissent."
              : !showFrame
                ? "Glissez la photo dans l’aperçu pour choisir ce qui reste visible ; zoomez pour resserrer."
                : movable
                  ? "Glissez la photo pour choisir ce qui reste visible."
                  : "Cette photo remplit déjà le cadre exactement."}
          </p>

          <div className="mt-4 space-y-4">
            <div className="flex gap-2">
              {(["cover", "contain"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onChange({ ...framing, fit: mode })}
                  className={
                    "h-11 flex-1 rounded-full border px-4 text-sm font-medium transition-colors " +
                    (framing.fit === mode
                      ? "border-terre bg-terre/10 text-foreground"
                      : "border-input text-muted-foreground hover:bg-muted")
                  }
                >
                  {mode === "cover" ? "Remplir le cadre" : "Photo entière"}
                </button>
              ))}
            </div>

            {framing.fit === "cover" ? (
              <label className="block text-sm">
                <span className="flex items-center justify-between text-muted-foreground">
                  Zoom
                  <span className="font-medium text-foreground">
                    ×{framing.cropZoom.toFixed(2)}
                  </span>
                </span>
                <input
                  type="range"
                  min={MIN_ZOOM}
                  max={MAX_ZOOM}
                  step={0.05}
                  value={framing.cropZoom}
                  onChange={(event) =>
                    onChange({ ...framing, cropZoom: Number(event.target.value) })
                  }
                  className="mt-1 h-11 w-full accent-terre"
                />
              </label>
            ) : null}

            <button
              type="button"
              onClick={() => onChange({ ...DEFAULT_FRAMING })}
              className="h-11 rounded-full border border-input px-4 text-sm text-foreground transition-colors hover:bg-muted"
            >
              Recentrer
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
