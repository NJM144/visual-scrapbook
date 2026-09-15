import type { ReactNode } from "react";
import { useState } from "react";
import { BookPages, type ViewerPhoto } from "@/components/BookPages";
import {
  MAX_SLOTS_PER_PAGE,
  type AlbumLayout,
  type BookPlan,
  type LayoutSlot,
  type PageFlow,
  type PageStyle,
} from "@/lib/book-layout";
import type { BookTheme } from "@/lib/book-themes";
import {
  DEFAULT_TEXT_SIZE,
  MAX_TEXT_LENGTH,
  TEXT_SIZES,
  type TextAlign,
  type TextBlock,
} from "@/lib/text-blocks";
import {
  GHOST_LIFT,
  GHOST_SIZE,
  slotKey,
  useSlotDrag,
  type SlotPosition,
} from "@/lib/use-slot-drag";
import { WALLPAPERS, wallpaperScreenUrl, type Wallpaper } from "@/lib/wallpapers";

/** Couleurs de fond proposées à la page ; le thème reste le premier choix. */
const PAPER_PALETTE: { hex: string; label: string }[] = [
  { hex: "#FFFFFF", label: "Blanc" },
  { hex: "#FBF5EC", label: "Crème" },
  { hex: "#FFF8E7", label: "Ivoire" },
  { hex: "#F6EFE3", label: "Sable" },
  { hex: "#E8DCC8", label: "Kraft" },
  { hex: "#EFE6D8", label: "Lin" },
  { hex: "#FFF4F2", label: "Rose pâle" },
  { hex: "#F2F8F7", label: "Lagune" },
  { hex: "#EEF6EA", label: "Menthe" },
  { hex: "#EAF2FA", label: "Ciel" },
  { hex: "#F1ECF7", label: "Lavande" },
  { hex: "#F4F3EF", label: "Gris perle" },
  { hex: "#C2A377", label: "Ocre" },
  { hex: "#1E5B3A", label: "Forêt" },
  { hex: "#141B33", label: "Nuit" },
  { hex: "#141414", label: "Encre" },
];

const FLOWS: { id: PageFlow; label: string }[] = [
  { id: "auto", label: "Selon les photos" },
  { id: "cote", label: "Côte à côte" },
  { id: "pile", label: "L’une sous l’autre" },
];

/** Une retouche de page : `undefined` retire le réglage, la page hérite de nouveau. */
interface PageStylePatch {
  paper?: string | undefined;
  wallpaper?: string | null | undefined;
  flow?: PageFlow | undefined;
}

function mergeStyle(page: AlbumLayout["pages"][number], patch: PageStylePatch) {
  const { paper, wallpaper, flow, ...rest } = page;
  const next: PageStyle = {};
  const nextPaper = "paper" in patch ? patch.paper : paper;
  const nextWallpaper = "wallpaper" in patch ? patch.wallpaper : wallpaper;
  const nextFlow = "flow" in patch ? patch.flow : flow;
  if (nextPaper !== undefined) next.paper = nextPaper;
  if (nextWallpaper !== undefined) next.wallpaper = nextWallpaper;
  if (nextFlow !== undefined && nextFlow !== "auto") next.flow = nextFlow;
  return { ...rest, ...next };
}

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
  dpiByIndex,
  minDpi,
  wallpaper,
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
  dpiByIndex?: ReadonlyMap<number, number> | undefined;
  minDpi?: number | undefined;
  wallpaper?: Wallpaper | null | undefined;
}) {
  /** Photo dont le panneau d'actions est ouvert. */
  const [openPhoto, setOpenPhoto] = useState<string | null>(null);
  /** Case dont le paragraphe est en cours d'écriture. */
  const [openText, setOpenText] = useState<SlotPosition | null>(null);
  /** Page dont les réglages sont ouverts : rang parmi les pages de photos, numéro imprimé. */
  const [openPage, setOpenPage] = useState<{ index: number; number: number } | null>(null);

  const photoById = new Map(photos.map((photo) => [photo.id, photo]));
  /** La vignette d'une case ; rien pour un paragraphe, qui n'est pas une image. */
  const urlOf = (content: LayoutSlot) => {
    if (typeof content !== "string") return undefined;
    const photo = photoById.get(content);
    return photo ? photo.thumbUrl || photo.signedUrl : undefined;
  };

  const contentAt = (position: SlotPosition | null): LayoutSlot =>
    position ? (layout.pages[position.page]?.slots[position.slot] ?? null) : null;

  /** Le paragraphe d'une case, s'il y en a un. */
  const textAt = (position: SlotPosition | null): TextBlock | null => {
    const content = contentAt(position);
    return content && typeof content !== "string" ? content : null;
  };

  /** Écrit, modifie ou retire le paragraphe d'une case. */
  const setSlotContent = (position: SlotPosition, content: LayoutSlot) => {
    onLayoutChange({
      pages: layout.pages.map((page, pageIndex) =>
        pageIndex === position.page
          ? { ...page, slots: page.slots.map((slot, i) => (i === position.slot ? content : slot)) }
          : page,
      ),
    });
  };

  const patchText = (position: SlotPosition, patch: Partial<TextBlock>) => {
    const current = textAt(position) ?? { text: "" };
    setSlotContent(position, { ...current, ...patch });
  };

  const drag = useSlotDrag({
    layout,
    onChange: onLayoutChange,
    // Une photo ouvre ses actions ; une case vide ou un paragraphe ouvrent
    // l'écriture. Toucher une case vide et pouvoir y écrire, c'est ce qui
    // rend le texte aussi accessible qu'une photo.
    onTap: (position) => {
      const content = layout.pages[position.page]?.slots[position.slot] ?? null;
      if (typeof content === "string") setOpenPhoto(content);
      else setOpenText(position);
    },
  });

  const armMove = () => {
    if (!openPhoto) return;
    for (const [pageIndex, page] of layout.pages.entries()) {
      const slot = page.slots.findIndex((content) => content === openPhoto);
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
    const slots = page?.slots ?? [];
    const photoCount = slots.filter((slot) => typeof slot === "string").length;
    const textCount = slots.filter((slot) => slot !== null && typeof slot !== "string").length;
    // Une photo retirée d'ici revient à la fin du livre ; un paragraphe, lui,
    // n'existe que dans cette page et disparaît avec elle. Il faut le dire.
    const message =
      photoCount > 0 && textCount > 0
        ? "Cette page contient " +
          photoCount +
          " photo(s), replacée(s) à la fin du livre, et " +
          textCount +
          " texte(s), qui seront perdus. Continuer ?"
        : photoCount > 0
          ? "Cette page contient " +
            photoCount +
            " photo(s). Elles seront replacées à la fin du livre. Continuer ?"
          : "Cette page contient " + textCount + " texte(s), qui seront perdus. Continuer ?";
    if (photoCount + textCount > 0 && !window.confirm(message)) {
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

  const setPageStyle = (index: number, patch: PageStylePatch) => {
    onLayoutChange({
      pages: layout.pages.map((page, i) => (i === index ? mergeStyle(page, patch) : page)),
    });
  };

  /** La couleur et le papier peint de cette page, sur toutes les autres. */
  const applyStyleToAll = (index: number) => {
    const source = layout.pages[index];
    if (!source) return;
    const patch: PageStylePatch = { paper: source.paper, wallpaper: source.wallpaper };
    onLayoutChange({ pages: layout.pages.map((page) => mergeStyle(page, patch)) });
  };

  const draggedUrl = urlOf(drag.draggedContent);
  const selectedUrl = urlOf(drag.selectedContent);
  const openUrl = urlOf(openPhoto);
  const openTextBlock = textAt(openText);
  const pageOpen = openPage ? layout.pages[openPage.index] : undefined;
  const pageWallpaperId =
    pageOpen && pageOpen.wallpaper !== undefined ? pageOpen.wallpaper : wallpaper?.id;
  const pageWallpaperShown = WALLPAPERS.find((item) => item.id === pageWallpaperId);

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
        dpiByIndex={dpiByIndex}
        minDpi={minDpi}
        wallpaper={wallpaper}
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
          onPageStyle: (index, number) => setOpenPage({ index, number }),
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
      {drag.selected && (selectedUrl || drag.selectedContent) ? (
        <div className="above-mobile-nav fixed inset-x-3 z-[60] mx-auto flex max-w-md items-center gap-2.5 rounded-full border border-border bg-card/95 p-1.5 pl-2 shadow-xl backdrop-blur">
          {selectedUrl ? (
            <img src={selectedUrl} alt="" className="size-10 shrink-0 rounded-full object-cover" />
          ) : (
            <span
              aria-hidden
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted font-serif text-lg text-foreground"
            >
              T
            </span>
          )}
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

      {/* Écrire dans une case : un paragraphe se place, se déplace et se
          supprime comme une photo. Le panneau monte du bas, comme les autres. */}
      {openText ? (
        <div className="fixed inset-0 z-[65] flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="Fermer"
            onClick={() => setOpenText(null)}
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
          />
          <div className="relative max-h-[85svh] w-full overflow-y-auto rounded-t-3xl border border-border bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:max-w-lg sm:rounded-3xl sm:pb-5">
            <div className="mb-4 flex items-center gap-3">
              <span
                aria-hidden
                className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-muted font-serif text-2xl text-foreground"
              >
                T
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">
                  {openTextBlock ? "Ce texte" : "Écrire dans cette case"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Un paragraphe à côté de vos photos : qui, où, ce jour-là.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpenText(null)}
                aria-label="Fermer"
                className="size-11 shrink-0 rounded-full border border-input text-sm transition-colors hover:bg-muted"
              >
                ✕
              </button>
            </div>

            <textarea
              value={openTextBlock?.text ?? ""}
              maxLength={MAX_TEXT_LENGTH}
              rows={6}
              autoFocus
              placeholder="Ce matin-là, toute la famille est venue de Bouaké…"
              onChange={(event) => patchText(openText, { text: event.target.value })}
              className="w-full resize-y rounded-xl border border-input bg-background px-4 py-3 text-base outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="mt-1 text-right text-xs text-muted-foreground">
              {(openTextBlock?.text ?? "").length} / {MAX_TEXT_LENGTH}
            </p>

            <p className="mt-4 mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
              Taille
            </p>
            <div className="flex flex-wrap gap-2">
              {TEXT_SIZES.map((size) => (
                <button
                  key={size.id}
                  type="button"
                  onClick={() => patchText(openText, { size: size.id })}
                  className={
                    "h-10 rounded-full border px-4 text-sm transition-colors " +
                    ((openTextBlock?.size ?? DEFAULT_TEXT_SIZE) === size.id
                      ? "border-terre bg-terre/10 text-foreground"
                      : "border-input text-foreground hover:bg-muted")
                  }
                >
                  {size.label}
                </button>
              ))}
            </div>

            <p className="mt-5 mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
              Alignement
            </p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: "gauche", label: "À gauche" },
                  { id: "centre", label: "Centré" },
                ] as { id: TextAlign; label: string }[]
              ).map((align) => (
                <button
                  key={align.id}
                  type="button"
                  onClick={() => patchText(openText, { align: align.id })}
                  className={
                    "h-10 rounded-full border px-4 text-sm transition-colors " +
                    ((openTextBlock?.align ?? "gauche") === align.id
                      ? "border-terre bg-terre/10 text-foreground"
                      : "border-input text-foreground hover:bg-muted")
                  }
                >
                  {align.label}
                </button>
              ))}
            </div>

            {openTextBlock ? (
              <button
                type="button"
                onClick={() => {
                  setSlotContent(openText, null);
                  setOpenText(null);
                }}
                className="mt-6 h-11 w-full rounded-full border border-input px-4 text-sm text-destructive transition-colors hover:bg-destructive/10"
              >
                Retirer ce texte — la case redevient libre
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => setOpenText(null)}
              className="mt-2 h-11 w-full rounded-full bg-terre px-4 text-sm font-medium text-white transition-colors hover:bg-terre/90"
            >
              Terminé
            </button>
          </div>
        </div>
      ) : null}

      {/* Ce qu'une page décide pour elle-même : sa couleur, son papier peint,
          l'orientation de ses photos. Tout y est réversible : « Thème » et
          « Comme le livre » rendent la main. */}
      {openPage && pageOpen ? (
        <div className="fixed inset-0 z-[65] flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="Fermer"
            onClick={() => setOpenPage(null)}
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
          />
          <div className="relative max-h-[85svh] w-full overflow-y-auto rounded-t-3xl border border-border bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:max-w-lg sm:rounded-3xl sm:pb-5">
            <div className="mb-5 flex items-center gap-3">
              <span
                aria-hidden
                className="size-14 shrink-0 overflow-hidden rounded-xl ring-1 ring-black/10"
                style={{ backgroundColor: pageOpen.paper ?? theme.paper }}
              >
                {pageWallpaperShown ? (
                  <img
                    src={wallpaperScreenUrl(pageWallpaperShown)}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : null}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">Page {openPage.number}</p>
                <p className="text-xs text-muted-foreground">
                  Couleur, papier peint et orientation des photos, pour cette page seulement.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpenPage(null)}
                aria-label="Fermer"
                className="size-11 shrink-0 rounded-full border border-input text-sm transition-colors hover:bg-muted"
              >
                ✕
              </button>
            </div>

            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
              Couleur de fond
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPageStyle(openPage.index, { paper: undefined })}
                title={"Papier du thème (" + theme.paper + ")"}
                className={
                  "h-10 rounded-full border px-3 text-xs transition-colors " +
                  (pageOpen.paper === undefined
                    ? "border-terre ring-2 ring-terre/40"
                    : "border-input hover:bg-muted")
                }
                style={{ backgroundColor: theme.paper }}
              >
                <span className="rounded bg-card/80 px-1.5 py-0.5 text-foreground">Thème</span>
              </button>
              {PAPER_PALETTE.map((color) => (
                <button
                  key={color.hex}
                  type="button"
                  onClick={() => setPageStyle(openPage.index, { paper: color.hex })}
                  title={color.label}
                  aria-label={color.label}
                  className={
                    "size-10 rounded-full border transition-transform " +
                    (pageOpen.paper?.toUpperCase() === color.hex
                      ? "scale-110 border-terre ring-2 ring-terre/40"
                      : "border-black/10 hover:scale-105")
                  }
                  style={{ backgroundColor: color.hex }}
                />
              ))}
              <label className="flex h-10 cursor-pointer items-center gap-2 rounded-full border border-input px-3 text-xs text-foreground transition-colors hover:bg-muted">
                <input
                  type="color"
                  value={pageOpen.paper ?? theme.paper}
                  onChange={(event) =>
                    setPageStyle(openPage.index, { paper: event.target.value.toUpperCase() })
                  }
                  className="size-6 cursor-pointer rounded border-0 bg-transparent p-0"
                />
                Autre couleur
              </label>
            </div>

            <p className="mt-6 mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
              Papier peint
            </p>
            <div className="-mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-2">
              <button
                type="button"
                onClick={() => setPageStyle(openPage.index, { wallpaper: undefined })}
                className={
                  "w-28 shrink-0 snap-start overflow-hidden rounded-2xl border text-left transition-colors " +
                  (pageOpen.wallpaper === undefined
                    ? "border-terre ring-2 ring-terre/40"
                    : "border-border hover:border-foreground/30")
                }
              >
                {wallpaper ? (
                  <img
                    src={wallpaperScreenUrl(wallpaper)}
                    alt=""
                    className="h-20 w-full object-cover"
                  />
                ) : (
                  <span className="block h-20 w-full" style={{ backgroundColor: theme.paper }} />
                )}
                <span className="block truncate px-2.5 py-2 text-xs font-medium text-foreground">
                  Comme le livre
                </span>
              </button>
              <button
                type="button"
                onClick={() => setPageStyle(openPage.index, { wallpaper: null })}
                className={
                  "w-28 shrink-0 snap-start overflow-hidden rounded-2xl border text-left transition-colors " +
                  (pageOpen.wallpaper === null
                    ? "border-terre ring-2 ring-terre/40"
                    : "border-border hover:border-foreground/30")
                }
              >
                <span
                  className="block h-20 w-full"
                  style={{ backgroundColor: pageOpen.paper ?? theme.paper }}
                />
                <span className="block truncate px-2.5 py-2 text-xs font-medium text-foreground">
                  Aucun
                </span>
              </button>
              {WALLPAPERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPageStyle(openPage.index, { wallpaper: item.id })}
                  className={
                    "w-28 shrink-0 snap-start overflow-hidden rounded-2xl border text-left transition-colors " +
                    (pageOpen.wallpaper === item.id
                      ? "border-terre ring-2 ring-terre/40"
                      : "border-border hover:border-foreground/30")
                  }
                >
                  <img
                    src={wallpaperScreenUrl(item)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-20 w-full object-cover"
                  />
                  <span className="block truncate px-2.5 py-2 text-xs font-medium text-foreground">
                    {item.label}
                  </span>
                </button>
              ))}
            </div>

            <p className="mt-6 mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
              Orientation des photos
            </p>
            <div className="flex flex-wrap gap-2">
              {FLOWS.map((flow) => (
                <button
                  key={flow.id}
                  type="button"
                  onClick={() => setPageStyle(openPage.index, { flow: flow.id })}
                  className={
                    "h-10 rounded-full border px-4 text-sm transition-colors " +
                    ((pageOpen.flow ?? "auto") === flow.id
                      ? "border-terre bg-terre/10 text-foreground"
                      : "border-input text-foreground hover:bg-muted")
                  }
                >
                  {flow.label}
                </button>
              ))}
            </div>
            {pageOpen.slots.length === 1 || pageOpen.slots.length === 4 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                L’orientation joue pour deux ou trois photos : une seule remplit la page, quatre
                forment une grille.
              </p>
            ) : null}

            <button
              type="button"
              onClick={() => applyStyleToAll(openPage.index)}
              className="mt-6 h-11 w-full rounded-full border border-input px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Appliquer la couleur et le papier peint à toutes les pages
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
