import { useEffect, useRef, useState } from "react";
import { MAX_SLOTS_PER_PAGE, type AlbumLayout } from "@/lib/book-layout";
import type { BookTheme } from "@/lib/book-themes";
import type { PrintFormat } from "@/lib/print-formats";

/**
 * Composition des pages : ajouter, supprimer, déplacer une photo d'une page à
 * l'autre.
 *
 * Pensée d'abord pour le doigt :
 *
 * - Un geste ordinaire fait défiler la page. Les photos couvrent l'essentiel
 *   de l'écran d'un téléphone : si les toucher les attrapait, on ne pourrait
 *   plus descendre dans le livre.
 * - Un appui long soulève la photo (avec une vibration là où le téléphone la
 *   permet). On la promène alors, l'écran défile seul près des bords — c'est
 *   ce qui rend possible un déplacement de la page 1 à la page 12 — et la case
 *   visée s'éclaire.
 * - Toucher une photo puis une case reste possible, pour qui préfère ne pas
 *   glisser ; un bandeau rappelle la sélection une fois la page défilée.
 *
 * À la souris, le glissement part dès que le curseur bouge, sans attente.
 *
 * Tout passe par les *pointer events* : le glisser-déposer HTML5 n'existe pas
 * au doigt.
 */

export interface ComposerPhoto {
  id: string;
  signedUrl: string;
  /** Miniature ; un téléphone promène sans peine soixante vignettes, pas soixante originaux. */
  thumbUrl?: string | null;
}

/** Durée d'appui avant que la photo ne se soulève. */
const LONG_PRESS_MS = 250;
/** Au doigt, bouger davantage avant ce délai signifie qu'on fait défiler. */
const TOUCH_TOLERANCE_PX = 8;
/** À la souris, distance au-delà de laquelle l'appui devient un glissement. */
const MOUSE_DRAG_THRESHOLD_PX = 6;
/** Vitesse maximale du défilement automatique, en pixels par image. */
const AUTO_SCROLL_MAX = 22;
/** Taille de la vignette qui suit le doigt ; elle flotte au-dessus pour rester visible. */
const GHOST_SIZE = 88;
const GHOST_LIFT = 104;

interface Position {
  page: number;
  slot: number;
}

interface Press {
  position: Position;
  pointerId: number;
  touch: boolean;
  filled: boolean;
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
  timer: number | null;
  release: () => void;
}

const keyOf = (position: Position) => position.page + ":" + position.slot;

/** Bandes haute et basse où le doigt fait défiler, sous l'en-tête et au-dessus des barres. */
function scrollZones() {
  const mobile = window.innerWidth < 640;
  return {
    top: mobile ? 150 : 90,
    bottom: window.innerHeight - (mobile ? 190 : 90),
  };
}

function positionAt(x: number, y: number): Position | null {
  const holder = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-slot]");
  const raw = holder?.dataset["slot"];
  if (!raw) return null;

  const [page, slot] = raw.split(":").map(Number);
  if (page === undefined || slot === undefined || Number.isNaN(page) || Number.isNaN(slot)) {
    return null;
  }
  return { page, slot };
}

function vibrate(ms: number) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // Vibration refusée ou absente : le retour visuel suffit.
  }
}

export function PageComposer({
  layout,
  photos,
  format,
  theme,
  onChange,
}: {
  layout: AlbumLayout;
  photos: ComposerPhoto[];
  format: PrintFormat;
  theme: BookTheme;
  onChange: (layout: AlbumLayout) => void;
}) {
  const [selected, setSelected] = useState<Position | null>(null);
  /** Glissement en cours : case d'origine et point de départ de la vignette. */
  const [drag, setDrag] = useState<{ from: Position; x: number; y: number } | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  /** Case appuyée, en attente de l'appui long. */
  const [pressing, setPressing] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLImageElement>(null);
  const pressRef = useRef<Press | null>(null);
  const hoverRef = useRef<string | null>(null);
  const frameRef = useRef<number | null>(null);

  // Les écouteurs posés sur window pendant un geste doivent voir la
  // disposition courante, pas celle du rendu où le geste a commencé.
  const latest = useRef({ layout, onChange, selected });
  useEffect(() => {
    latest.current = { layout, onChange, selected };
  });

  const urlById = new Map(photos.map((photo) => [photo.id, photo.thumbUrl || photo.signedUrl]));

  const photoAt = (position: Position | null): string | null => {
    if (!position) return null;
    return latest.current.layout.pages[position.page]?.slots[position.slot] ?? null;
  };

  /** Échange deux cases. Déplacer sur une case vide revient à y poser la photo. */
  const swap = (from: Position, to: Position) => {
    if (from.page === to.page && from.slot === to.slot) return;

    const current = latest.current.layout;
    const pages = current.pages.map((page) => ({ ...page, slots: [...page.slots] }));
    const source = pages[from.page];
    const target = pages[to.page];
    if (!source || !target) return;

    const moved = source.slots[from.slot] ?? null;
    source.slots[from.slot] = target.slots[to.slot] ?? null;
    target.slots[to.slot] = moved;

    latest.current.onChange({ pages });
  };

  const tap = (position: Position) => {
    const current = latest.current.selected;
    if (current) {
      if (current.page !== position.page || current.slot !== position.slot) {
        swap(current, position);
        vibrate(8);
      }
      setSelected(null);
      return;
    }
    if (photoAt(position)) setSelected(position);
  };

  const moveGhost = (x: number, y: number) => {
    const ghost = ghostRef.current;
    if (ghost) {
      ghost.style.transform =
        "translate(" + (x - GHOST_SIZE / 2) + "px, " + (y - GHOST_LIFT) + "px)";
    }
  };

  const updateHover = (x: number, y: number) => {
    const position = positionAt(x, y);
    const key = position ? keyOf(position) : null;
    if (key !== hoverRef.current) {
      hoverRef.current = key;
      setHover(key);
    }
  };

  const stopAutoScroll = () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  };

  // Défilement automatique : plus le doigt s'enfonce dans la bande du bord,
  // plus l'écran file. Les cases bougent sous le doigt immobile, d'où le
  // recalcul de la case visée à chaque image.
  const startAutoScroll = () => {
    stopAutoScroll();
    const tick = () => {
      const press = pressRef.current;
      if (!press?.active) return;

      const zones = scrollZones();
      let delta = 0;
      if (press.y < zones.top) delta = -Math.min(AUTO_SCROLL_MAX, (zones.top - press.y) / 3);
      else if (press.y > zones.bottom) {
        delta = Math.min(AUTO_SCROLL_MAX, (press.y - zones.bottom) / 3);
      }
      if (delta !== 0) {
        window.scrollBy(0, delta);
        updateHover(press.x, press.y);
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  };

  const finish = () => {
    const press = pressRef.current;
    if (press) {
      if (press.timer !== null) window.clearTimeout(press.timer);
      press.release();
    }
    pressRef.current = null;
    hoverRef.current = null;
    stopAutoScroll();
    setDrag(null);
    setHover(null);
    setPressing(null);
  };

  const activate = () => {
    const press = pressRef.current;
    if (!press || press.active) return;

    press.active = true;
    press.timer = null;
    setPressing(null);
    setSelected(null);
    setDrag({ from: press.position, x: press.x, y: press.y });
    vibrate(12);
    updateHover(press.x, press.y);
    startAutoScroll();
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLElement>, position: Position) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    // Un second doigt ne démarre pas un second geste.
    if (pressRef.current) return;

    const touch = event.pointerType !== "mouse";
    // À la souris, empêche la sélection de texte et le glisser natif de l'image.
    if (!touch) event.preventDefault();

    const onMove = (moveEvent: PointerEvent) => {
      const press = pressRef.current;
      if (!press || moveEvent.pointerId !== press.pointerId) return;
      press.x = moveEvent.clientX;
      press.y = moveEvent.clientY;

      if (!press.active) {
        const distance = Math.hypot(press.x - press.startX, press.y - press.startY);
        if (press.touch) {
          // Le doigt part avant l'appui long : c'est un défilement, on s'efface.
          if (distance > TOUCH_TOLERANCE_PX) finish();
        } else if (press.filled && distance > MOUSE_DRAG_THRESHOLD_PX) {
          activate();
        }
        return;
      }

      moveGhost(press.x, press.y);
      updateHover(press.x, press.y);
    };

    const onUp = (upEvent: PointerEvent) => {
      const press = pressRef.current;
      if (!press || upEvent.pointerId !== press.pointerId) return;

      if (press.active) {
        const target = positionAt(upEvent.clientX, upEvent.clientY);
        const from = press.position;
        finish();
        if (target) {
          swap(from, target);
          vibrate(8);
        }
        return;
      }

      finish();
      tap(position);
    };

    const onCancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId === pressRef.current?.pointerId) finish();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);

    const filled = Boolean(photoAt(position));
    const press: Press = {
      position,
      pointerId: event.pointerId,
      touch,
      filled,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      active: false,
      timer: null,
      release: () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
      },
    };
    pressRef.current = press;

    if (touch && filled) {
      press.timer = window.setTimeout(activate, LONG_PRESS_MS);
      setPressing(keyOf(position));
    }
  };

  // Une fois la photo soulevée, le doigt ne doit plus faire défiler la page :
  // c'est le défilement automatique qui prend le relais. L'écouteur doit être
  // non passif — ceux de React le sont — et posé avant que le doigt ne se
  // pose, sans quoi Safari l'ignore.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const block = (event: TouchEvent) => {
      if (pressRef.current?.active) event.preventDefault();
    };
    root.addEventListener("touchmove", block, { passive: false });
    return () => root.removeEventListener("touchmove", block);
  }, []);

  // Démontage en plein geste (changement d'onglet) : rien ne doit traîner.
  useEffect(
    () => () => {
      const press = pressRef.current;
      if (press?.timer != null) window.clearTimeout(press.timer);
      press?.release();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  const addPage = () => {
    onChange({
      pages: [...layout.pages, { id: "p" + Date.now().toString(36), slots: [null] }],
    });
  };

  const removePage = (index: number) => {
    const page = layout.pages[index];
    const filled = page?.slots.filter(Boolean).length ?? 0;
    if (
      filled > 0 &&
      !window.confirm(
        "Cette page contient " +
          filled +
          " photo(s). Elles seront replacées à la fin du livre. Continuer ?",
      )
    ) {
      return;
    }
    onChange({ pages: layout.pages.filter((_, i) => i !== index) });
    setSelected(null);
  };

  const changeSlotCount = (index: number, delta: number) => {
    const pages = layout.pages.map((page, i) => {
      if (i !== index) return page;

      const next = [...page.slots];
      if (delta > 0 && next.length < MAX_SLOTS_PER_PAGE) next.push(null);
      // On ne retire jamais une case occupée sans le dire : on retire d'abord
      // les vides, et on refuse si la page est pleine.
      if (delta < 0 && next.length > 1) {
        const emptyIndex = next.lastIndexOf(null);
        if (emptyIndex === -1) return page;
        next.splice(emptyIndex, 1);
      }
      return { ...page, slots: next };
    });
    onChange({ pages });
  };

  const draggedId = drag ? (layout.pages[drag.from.page]?.slots[drag.from.slot] ?? null) : null;
  const draggedUrl = draggedId ? urlById.get(draggedId) : undefined;
  const selectedId = selected ? (layout.pages[selected.page]?.slots[selected.slot] ?? null) : null;
  const selectedUrl = selectedId ? urlById.get(selectedId) : undefined;

  return (
    <div
      ref={rootRef}
      onContextMenu={(event) => {
        // Android ouvre le menu « enregistrer l'image » à l'appui long.
        if (pressRef.current) event.preventDefault();
      }}
    >
      <p className="mb-5 rounded-2xl bg-muted/60 p-4 text-sm leading-relaxed text-muted-foreground">
        <span className="sm:hidden">
          Appuyez longuement sur une photo pour la soulever, puis glissez-la : l’écran défile tout
          seul près des bords. Ou touchez-la, puis touchez la case où la poser.
        </span>
        <span className="hidden sm:inline">
          Faites glisser une photo sur une autre case pour les échanger — ou cliquez-la, puis
          cliquez la case de destination.
        </span>
      </p>

      <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">
        {layout.pages.map((page, pageIndex) => (
          <article key={page.id} className="rounded-2xl border border-border bg-card p-2 sm:p-3">
            <header className="mb-2 flex items-center justify-between gap-1">
              <span className="pl-1 text-sm font-medium text-foreground">
                <span className="hidden sm:inline">Page </span>
                {pageIndex + 1}
              </span>
              <span className="flex gap-1">
                <button
                  type="button"
                  onClick={() => changeSlotCount(pageIndex, -1)}
                  disabled={page.slots.length <= 1}
                  aria-label="Retirer une case"
                  className="size-9 rounded-full border border-input text-sm transition-colors hover:bg-muted disabled:opacity-40"
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={() => changeSlotCount(pageIndex, 1)}
                  disabled={page.slots.length >= MAX_SLOTS_PER_PAGE}
                  aria-label="Ajouter une case"
                  className="size-9 rounded-full border border-input text-sm transition-colors hover:bg-muted disabled:opacity-40"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => removePage(pageIndex)}
                  aria-label="Supprimer la page"
                  className="size-9 rounded-full border border-input text-sm text-destructive transition-colors hover:bg-destructive/10"
                >
                  ✕
                </button>
              </span>
            </header>

            <div
              className="grid gap-1 rounded-xl p-1.5 sm:gap-1.5 sm:p-2"
              style={{
                aspectRatio: format.widthMm + " / " + format.heightMm,
                backgroundColor: theme.paper,
                gridTemplateColumns: page.slots.length >= 3 ? "1fr 1fr" : "1fr",
                gridAutoRows: "1fr",
              }}
            >
              {page.slots.map((photoId, slotIndex) => {
                const key = pageIndex + ":" + slotIndex;
                const isSelected = selected?.page === pageIndex && selected?.slot === slotIndex;
                const isSource = drag?.from.page === pageIndex && drag?.from.slot === slotIndex;
                const isTarget = drag !== null && hover === key && !isSource;
                const url = photoId ? urlById.get(photoId) : undefined;

                return (
                  <div
                    key={slotIndex}
                    data-slot={key}
                    onPointerDown={(event) =>
                      handlePointerDown(event, { page: pageIndex, slot: slotIndex })
                    }
                    className={
                      "relative select-none overflow-hidden rounded-lg transition-[transform,opacity,box-shadow] duration-150 [-webkit-touch-callout:none] [touch-action:manipulation] " +
                      (url ? "cursor-grab " : "border border-dashed border-black/20 ") +
                      (isSelected ? "ring-2 ring-terre ring-offset-2 " : "") +
                      (isTarget ? "scale-[1.04] ring-4 ring-terre ring-offset-1 " : "") +
                      (isSource ? "opacity-30 " : "") +
                      (pressing === key ? "scale-95 " : "") +
                      (selected && !isSelected ? "ring-1 ring-terre/40 " : "")
                    }
                  >
                    {url ? (
                      <img
                        src={url}
                        alt=""
                        draggable={false}
                        loading="lazy"
                        decoding="async"
                        className="pointer-events-none size-full object-cover [-webkit-touch-callout:none]"
                      />
                    ) : (
                      <span
                        className={
                          "flex size-full items-center justify-center text-xs " +
                          (isTarget ? "bg-terre/15 text-terre" : "text-black/30")
                        }
                      >
                        vide
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </div>

      <button
        type="button"
        onClick={addPage}
        className="mt-6 w-full rounded-full border border-input bg-background px-6 py-3.5 text-sm font-medium text-foreground transition-colors hover:bg-muted sm:w-auto"
      >
        Ajouter une page
      </button>

      {/* Vignette qui suit le doigt, décalée au-dessus pour ne pas être masquée. */}
      {drag && draggedUrl ? (
        <img
          ref={ghostRef}
          src={draggedUrl}
          alt=""
          className="pointer-events-none fixed left-0 top-0 z-[70] rounded-xl object-cover shadow-2xl ring-2 ring-white"
          style={{
            width: GHOST_SIZE,
            height: GHOST_SIZE,
            transform:
              "translate(" + (drag.x - GHOST_SIZE / 2) + "px, " + (drag.y - GHOST_LIFT) + "px) ",
          }}
        />
      ) : null}

      {/* La sélection reste visible une fois la page défilée. Même empreinte
          que la barre d'actions qu'il recouvre : il ne masque rien de plus. */}
      {selected && selectedUrl ? (
        <div className="above-mobile-nav fixed inset-x-3 z-[60] mx-auto flex max-w-md items-center gap-2.5 rounded-full border border-border bg-card/95 p-1.5 pl-2 shadow-xl backdrop-blur">
          <img src={selectedUrl} alt="" className="size-10 shrink-0 rounded-full object-cover" />
          <p className="min-w-0 flex-1 text-sm leading-tight text-foreground">
            Touchez la case de destination.
          </p>
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="h-11 shrink-0 rounded-full border border-input px-4 text-sm transition-colors hover:bg-muted"
          >
            Annuler
          </button>
        </div>
      ) : null}
    </div>
  );
}
