import type { ReactNode } from "react";
import { useState } from "react";
import { BookPages, type ViewerPhoto } from "@/components/BookPages";
import { MAX_SLOTS_PER_PAGE, type AlbumLayout, type BookPlan } from "@/lib/book-layout";
import type { BookTheme } from "@/lib/book-themes";
import { GHOST_LIFT, GHOST_SIZE, slotKey, useSlotDrag } from "@/lib/use-slot-drag";

/**
 * Le livre, modifiable à même la page.
 *
 * Il n'y a pas d'écran de composition séparé : ce qu'on voit est ce qui
 * s'imprime, et c'est là-dessus qu'on travaille. Un appui long soulève une
 * photo, un appui simple ouvre ce qu'on peut lui faire — la légende, le
 * cadrage, la suppression. Les commandes de page vivent sous chaque page.
 *
 * Les actions propres à une photo viennent du studio par `renderPhotoActions`
 * plutôt que d'être recopiées ici : c'est lui qui tient les légendes en cours
 * de saisie et les enregistre.
 */

export function BookEditor({
  plan,
  layout,
  onLayoutChange,
  theme,
  photos,
  title,
  subtitle,
  dateLabel,
  renderPhotoActions,
}: {
  plan: BookPlan;
  /** Disposition correspondant au plan affiché, page pour page. */
  layout: AlbumLayout;
  onLayoutChange: (layout: AlbumLayout) => void;
  theme: BookTheme;
  photos: ViewerPhoto[];
  title: string;
  subtitle: string;
  dateLabel: string;
  renderPhotoActions: (photoId: string, close: () => void) => ReactNode;
}) {
  /** Photo dont le panneau d'actions est ouvert. */
  const [openPhoto, setOpenPhoto] = useState<string | null>(null);

  const photoById = new Map(photos.map((photo) => [photo.id, photo]));
  const urlOf = (id: string | null) => {
    if (!id) return undefined;
    const photo = photoById.get(id);
    return photo ? photo.thumbUrl || photo.signedUrl : undefined;
  };

  const drag = useSlotDrag({
    layout,
    onChange: onLayoutChange,
    onTap: (position, filled) => {
      if (!filled) return;
      const id = layout.pages[position.page]?.slots[position.slot] ?? null;
      if (id) setOpenPhoto(id);
    },
  });

  const armMove = () => {
    if (!openPhoto) return;
    for (const [pageIndex, page] of layout.pages.entries()) {
      const slot = page.slots.indexOf(openPhoto);
      if (slot !== -1) {
        drag.setSelected({ page: pageIndex, slot });
        break;
      }
    }
    setOpenPhoto(null);
  };

  const insertPageAfter = (photoPage: number) => {
    onLayoutChange({
      pages: [
        ...layout.pages.slice(0, photoPage + 1),
        { id: "p" + Date.now().toString(36), slots: [null] },
        ...layout.pages.slice(photoPage + 1),
      ],
    });
  };

  const removePage = (photoPage: number) => {
    const page = layout.pages[photoPage];
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
    onLayoutChange({ pages: layout.pages.filter((_, index) => index !== photoPage) });
    drag.setSelected(null);
  };

  const changeSlotCount = (photoPage: number, delta: number) => {
    const pages = layout.pages.map((page, index) => {
      if (index !== photoPage) return page;

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
    onLayoutChange({ pages });
  };

  const draggedUrl = urlOf(drag.draggedId);
  const selectedUrl = urlOf(drag.selectedId);
  const openUrl = urlOf(openPhoto);

  return (
    <div
      ref={drag.rootRef}
      onContextMenu={(event) => {
        // Android ouvre le menu « enregistrer l'image » à l'appui long.
        event.preventDefault();
      }}
    >
      <BookPages
        plan={plan}
        theme={theme}
        photos={photos}
        title={title}
        subtitle={subtitle}
        dateLabel={dateLabel}
        edit={{
          onSlotPointerDown: drag.handlePointerDown,
          hoverKey: drag.hoverKey,
          pressingKey: drag.pressingKey,
          draggingKey: drag.drag ? slotKey(drag.drag.from) : null,
          selectedKey: drag.selected ? slotKey(drag.selected) : null,
          onInsertAfter: insertPageAfter,
          onRemovePage: removePage,
          onSlotCount: changeSlotCount,
          maxSlots: MAX_SLOTS_PER_PAGE,
        }}
      />

      <button
        type="button"
        onClick={() =>
          onLayoutChange({
            pages: [...layout.pages, { id: "p" + Date.now().toString(36), slots: [null] }],
          })
        }
        className="mt-6 w-full rounded-full border border-input bg-background px-6 py-3.5 text-sm font-medium text-foreground transition-colors hover:bg-muted sm:w-auto"
      >
        Ajouter une page à la fin
      </button>

      {/* Vignette qui suit le doigt, décalée au-dessus pour ne pas être masquée. */}
      {drag.drag && draggedUrl ? (
        <img
          ref={drag.ghostRef}
          src={draggedUrl}
          alt=""
          className="pointer-events-none fixed left-0 top-0 z-[70] rounded-xl object-cover shadow-2xl ring-2 ring-white"
          style={{
            width: GHOST_SIZE,
            height: GHOST_SIZE,
            transform:
              "translate(" +
              (drag.drag.x - GHOST_SIZE / 2) +
              "px, " +
              (drag.drag.y - GHOST_LIFT) +
              "px)",
          }}
        />
      ) : null}

      {/* La sélection reste visible une fois la page défilée. Même empreinte
          que la barre d'actions qu'il recouvre : il ne masque rien de plus. */}
      {drag.selected && selectedUrl ? (
        <div className="above-mobile-nav fixed inset-x-3 z-[60] mx-auto flex max-w-md items-center gap-2.5 rounded-full border border-border bg-card/95 p-1.5 pl-2 shadow-xl backdrop-blur">
          <img src={selectedUrl} alt="" className="size-10 shrink-0 rounded-full object-cover" />
          <p className="min-w-0 flex-1 text-sm leading-tight text-foreground">
            Touchez la case de destination.
          </p>
          <button
            type="button"
            onClick={() => drag.setSelected(null)}
            className="h-11 shrink-0 rounded-full border border-input px-4 text-sm transition-colors hover:bg-muted"
          >
            Annuler
          </button>
        </div>
      ) : null}

      {/* Ce qu'on peut faire à une photo, ouvert en touchant celle-ci dans le
          livre. Le panneau monte du bas : sur un téléphone, c'est là que le
          pouce arrive. */}
      {openPhoto ? (
        <div className="fixed inset-0 z-[65] flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="Fermer"
            onClick={() => setOpenPhoto(null)}
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
          />
          <div className="relative max-h-[85svh] w-full overflow-y-auto rounded-t-3xl border border-border bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:max-w-lg sm:rounded-3xl sm:pb-5">
            <div className="mb-4 flex items-center gap-3">
              {openUrl ? (
                <img src={openUrl} alt="" className="size-14 shrink-0 rounded-xl object-cover" />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">Cette photo</p>
                <p className="text-xs text-muted-foreground">
                  Appui long sur la photo pour la déplacer directement.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpenPhoto(null)}
                aria-label="Fermer"
                className="size-11 shrink-0 rounded-full border border-input text-sm transition-colors hover:bg-muted"
              >
                ✕
              </button>
            </div>

            <button
              type="button"
              onClick={armMove}
              className="mb-4 h-11 w-full rounded-full border border-input px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Déplacer vers une autre case
            </button>

            {renderPhotoActions(openPhoto, () => setOpenPhoto(null))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
