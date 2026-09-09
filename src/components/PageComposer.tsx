import { useRef, useState } from "react";
import { MAX_SLOTS_PER_PAGE, type AlbumLayout } from "@/lib/book-layout";
import type { BookTheme } from "@/lib/book-themes";
import type { PrintFormat } from "@/lib/print-formats";

/**
 * Composition des pages : ajouter, supprimer, déplacer une photo d'une page à
 * l'autre.
 *
 * Le déplacement repose sur les *pointer events*, pas sur le glisser-déposer
 * HTML5 : ce dernier n'existe tout simplement pas au doigt, et l'essentiel des
 * utilisateurs sera sur mobile. Le même geste sert des deux façons — un
 * déplacement fait glisser, un simple appui sélectionne, et l'appui suivant
 * dépose. Sur petit écran, viser une case en glissant est pénible ; le
 * toucher-toucher devient alors le mode naturel.
 */

export interface ComposerPhoto {
  id: string;
  signedUrl: string;
}

/** Distance au-delà de laquelle l'appui devient un glissement. */
const DRAG_THRESHOLD_PX = 8;

interface Position {
  page: number;
  slot: number;
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
  const [dragging, setDragging] = useState<{ position: Position; x: number; y: number } | null>(
    null,
  );
  const pressRef = useRef<{ position: Position; x: number; y: number; moved: boolean } | null>(
    null,
  );

  const urlById = new Map(photos.map((photo) => [photo.id, photo.signedUrl]));

  const at = (position: Position | null): string | null => {
    if (!position) return null;
    return layout.pages[position.page]?.slots[position.slot] ?? null;
  };

  /** Échange deux cases. Déplacer sur une case vide revient à y poser la photo. */
  const swap = (from: Position, to: Position) => {
    if (from.page === to.page && from.slot === to.slot) return;

    const pages = layout.pages.map((page) => ({ ...page, slots: [...page.slots] }));
    const source = pages[from.page];
    const target = pages[to.page];
    if (!source || !target) return;

    const moved = source.slots[from.slot] ?? null;
    source.slots[from.slot] = target.slots[to.slot] ?? null;
    target.slots[to.slot] = moved;

    onChange({ pages });
  };

  const handlePointerDown = (event: React.PointerEvent, position: Position) => {
    if (!at(position)) {
      // Case vide : elle ne peut être qu'une destination.
      if (selected) {
        swap(selected, position);
        setSelected(null);
      }
      return;
    }
    pressRef.current = { position, x: event.clientX, y: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    const press = pressRef.current;
    if (!press) return;

    const distance = Math.hypot(event.clientX - press.x, event.clientY - press.y);
    if (!press.moved && distance < DRAG_THRESHOLD_PX) return;

    press.moved = true;
    setDragging({ position: press.position, x: event.clientX, y: event.clientY });
  };

  const handlePointerUp = (event: React.PointerEvent) => {
    const press = pressRef.current;
    pressRef.current = null;
    setDragging(null);
    if (!press) return;

    if (!press.moved) {
      // Simple appui : on sélectionne, ou on dépose sur la sélection en cours.
      if (
        selected &&
        (selected.page !== press.position.page || selected.slot !== press.position.slot)
      ) {
        swap(selected, press.position);
        setSelected(null);
      } else {
        setSelected(
          selected && selected.page === press.position.page && selected.slot === press.position.slot
            ? null
            : press.position,
        );
      }
      return;
    }

    // Glissement : la cible est la case sous le doigt au moment du relâchement.
    const element = document.elementFromPoint(event.clientX, event.clientY);
    const holder = element?.closest<HTMLElement>("[data-slot]");
    const raw = holder?.dataset["slot"];
    if (!raw) return;

    const [page, slot] = raw.split(":").map(Number);
    if (page === undefined || slot === undefined || Number.isNaN(page) || Number.isNaN(slot))
      return;
    swap(press.position, { page, slot });
  };

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

  const draggedUrl = dragging ? urlById.get(at(dragging.position) ?? "") : undefined;

  return (
    <div>
      <p className="mb-5 rounded-2xl bg-muted/60 p-4 text-sm leading-relaxed text-muted-foreground">
        Touchez une photo puis la case de destination pour l’y déplacer — ou faites-la glisser. Les
        deux fonctionnent au doigt comme à la souris.
      </p>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {layout.pages.map((page, pageIndex) => (
          <article key={page.id} className="rounded-2xl border border-border bg-card p-3">
            <header className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-foreground">Page {pageIndex + 1}</span>
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
              className="grid gap-1.5 rounded-xl p-2"
              style={{
                aspectRatio: format.widthMm + " / " + format.heightMm,
                backgroundColor: theme.paper,
                gridTemplateColumns: page.slots.length >= 3 ? "1fr 1fr" : "1fr",
                gridAutoRows: "1fr",
              }}
            >
              {page.slots.map((photoId, slotIndex) => {
                const isSelected = selected?.page === pageIndex && selected?.slot === slotIndex;
                const url = photoId ? urlById.get(photoId) : undefined;

                return (
                  <div
                    key={slotIndex}
                    data-slot={pageIndex + ":" + slotIndex}
                    onPointerDown={(event) =>
                      handlePointerDown(event, { page: pageIndex, slot: slotIndex })
                    }
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={() => {
                      pressRef.current = null;
                      setDragging(null);
                    }}
                    className={
                      "relative touch-none select-none overflow-hidden rounded-lg transition-shadow " +
                      (url ? "cursor-grab " : "border border-dashed border-black/20 ") +
                      (isSelected ? "ring-2 ring-terre ring-offset-2" : "")
                    }
                  >
                    {url ? (
                      <img src={url} alt="" draggable={false} className="size-full object-cover" />
                    ) : (
                      <span className="flex size-full items-center justify-center text-xs text-black/30">
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

      {/* Aperçu suivant le doigt pendant le glissement. */}
      {dragging && draggedUrl ? (
        <img
          src={draggedUrl}
          alt=""
          className="pointer-events-none fixed z-50 size-24 rounded-xl object-cover opacity-90 shadow-2xl"
          style={{ left: dragging.x - 48, top: dragging.y - 48 }}
        />
      ) : null}
    </div>
  );
}
