import { useEffect, useRef, useState } from "react";
import type { AlbumLayout, LayoutSlot } from "./book-layout";

/**
 * Le geste qui déplace une photo d'une case à l'autre.
 *
 * Extrait tel quel du compositeur de pages, où il avait été réglé au doigt ;
 * il sert maintenant à même le livre, sur les pages telles qu'elles
 * s'impriment. Le réglage ne change pas :
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

/** Durée d'appui avant que la photo ne se soulève. */
const LONG_PRESS_MS = 250;
/** Au doigt, bouger davantage avant ce délai signifie qu'on fait défiler. */
const TOUCH_TOLERANCE_PX = 8;
/** À la souris, distance au-delà de laquelle l'appui devient un glissement. */
const MOUSE_DRAG_THRESHOLD_PX = 6;
/** Vitesse maximale du défilement automatique, en pixels par image. */
const AUTO_SCROLL_MAX = 22;
/** Taille de la vignette qui suit le doigt ; elle flotte au-dessus pour rester visible. */
export const GHOST_SIZE = 88;
export const GHOST_LIFT = 104;

export interface SlotPosition {
  page: number;
  slot: number;
}

interface Press {
  position: SlotPosition;
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

export const slotKey = (position: SlotPosition) => position.page + ":" + position.slot;

/** Bandes haute et basse où le doigt fait défiler, sous l'en-tête et au-dessus des barres. */
function scrollZones() {
  const mobile = window.innerWidth < 640;
  return {
    top: mobile ? 150 : 90,
    bottom: window.innerHeight - (mobile ? 190 : 90),
  };
}

function positionAt(x: number, y: number): SlotPosition | null {
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

export function useSlotDrag({
  layout,
  onChange,
  onTap,
}: {
  layout: AlbumLayout;
  onChange: (layout: AlbumLayout) => void;
  /**
   * Appui simple sur une case, hors déplacement déjà engagé. Absent, un appui
   * sur une photo l'arme pour un déplacement en deux temps.
   */
  onTap?: ((position: SlotPosition, filled: boolean) => void) | undefined;
}) {
  const [selected, setSelected] = useState<SlotPosition | null>(null);
  /** Glissement en cours : case d'origine et point de départ de la vignette. */
  const [drag, setDrag] = useState<{ from: SlotPosition; x: number; y: number } | null>(null);
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
  const latest = useRef({ layout, onChange, selected, onTap });
  useEffect(() => {
    latest.current = { layout, onChange, selected, onTap };
  });

  /** Ce que porte la case : photo, paragraphe, ou rien. */
  const contentAt = (position: SlotPosition | null): LayoutSlot => {
    if (!position) return null;
    return latest.current.layout.pages[position.page]?.slots[position.slot] ?? null;
  };

  /** Échange deux cases. Déplacer sur une case vide revient à y poser la photo. */
  const swap = (from: SlotPosition, to: SlotPosition) => {
    if (from.page === to.page && from.slot === to.slot) return;

    const current = latest.current.layout;
    const pages = current.pages.map((page) => ({ ...page, slots: [...page.slots] }));
    const source = pages[from.page];
    const target = pages[to.page];
    if (!source || !target) return;

    const moved = source.slots[from.slot] ?? null;
    source.slots[from.slot] = target.slots[to.slot] ?? null;
    target.slots[to.slot] = moved;

    // Repartir de la disposition courante : `{ pages }` seul effacerait les
    // effets rangés à la racine, et l'échange de deux photos n'a rien à voir
    // avec eux.
    latest.current.onChange({ ...current, pages });
  };

  const tap = (position: SlotPosition) => {
    const current = latest.current.selected;
    if (current) {
      if (current.page !== position.page || current.slot !== position.slot) {
        swap(current, position);
        vibrate(8);
      }
      setSelected(null);
      return;
    }

    const filled = Boolean(contentAt(position));
    const handler = latest.current.onTap;
    if (handler) {
      handler(position, filled);
      return;
    }
    if (filled) setSelected(position);
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
    const key = position ? slotKey(position) : null;
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

  const handlePointerDown = (event: React.PointerEvent<HTMLElement>, position: SlotPosition) => {
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

    const filled = Boolean(contentAt(position));
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
      setPressing(slotKey(position));
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

  /** Contenu soulevé et contenu armé : une photo s'affiche, un texte non. */
  const draggedContent = drag
    ? (layout.pages[drag.from.page]?.slots[drag.from.slot] ?? null)
    : null;
  const selectedContent = selected
    ? (layout.pages[selected.page]?.slots[selected.slot] ?? null)
    : null;

  return {
    rootRef,
    ghostRef,
    drag,
    draggedContent,
    selected,
    selectedContent,
    setSelected,
    hoverKey: hover,
    pressingKey: pressing,
    handlePointerDown,
  };
}
