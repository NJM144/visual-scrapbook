import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Trash2, X } from "lucide-react";

/**
 * Photo en plein écran, façon galerie de téléphone : on glisse à gauche ou à
 * droite pour passer à la suivante, et l'on peut zoomer à deux doigts.
 *
 * La miniature sert de fond le temps que l'original arrive : l'écran n'est
 * jamais noir, même sur une connexion lente.
 */

export interface ViewerItem {
  id: string;
  signedUrl: string;
  thumbUrl?: string | null;
  caption?: string | null;
}

/** Distance horizontale au-delà de laquelle un glissement change de photo. */
const SWIPE_PX = 50;

export function PhotoViewer({
  photos,
  index,
  onIndexChange,
  onClose,
  onDelete,
}: {
  photos: ViewerItem[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onDelete?: (photo: ViewerItem) => void;
}) {
  const photo = photos[index];
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);

  const go = useCallback(
    (delta: number) => {
      const next = index + delta;
      if (next >= 0 && next < photos.length) onIndexChange(next);
    },
    [index, photos.length, onIndexChange],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowLeft") go(-1);
      else if (event.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  // La page derrière ne doit pas défiler pendant qu'on regarde.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Précharge les voisines : le glissement suivant s'affiche aussitôt.
  useEffect(() => {
    for (const neighbour of [photos[index - 1], photos[index + 1]]) {
      if (neighbour) new Image().src = neighbour.signedUrl;
    }
  }, [index, photos]);

  if (!photo) return null;

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    startRef.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    setDragging(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = startRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) > Math.abs(dy)) setOffset(dx);
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = startRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const dx = event.clientX - start.x;
    startRef.current = null;
    setDragging(false);
    setOffset(0);
    if (dx < -SWIPE_PX) go(1);
    else if (dx > SWIPE_PX) go(-1);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo en plein écran"
      className="fixed inset-0 z-[80] flex flex-col bg-black text-white"
    >
      <div className="flex items-center justify-between px-2 pt-[env(safe-area-inset-top)]">
        <span className="px-3 text-sm text-white/70">
          {index + 1} / {photos.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="flex size-12 items-center justify-center rounded-full transition-colors hover:bg-white/10"
        >
          <X className="size-6" aria-hidden />
        </button>
      </div>

      <div
        className="relative flex-1 select-none overflow-hidden [touch-action:pan-y_pinch-zoom]"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        <img
          key={photo.id}
          src={photo.signedUrl}
          alt={photo.caption ?? ""}
          draggable={false}
          className="absolute inset-0 size-full object-contain"
          style={{
            transform: "translateX(" + offset + "px)",
            transition: dragging ? "none" : "transform 200ms ease-out",
            backgroundImage: photo.thumbUrl ? "url(" + photo.thumbUrl + ")" : undefined,
            backgroundSize: "contain",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
          }}
        />

        <button
          type="button"
          onClick={() => go(-1)}
          disabled={index === 0}
          aria-label="Photo précédente"
          className="absolute left-3 top-1/2 hidden size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20 disabled:opacity-0 sm:flex"
        >
          <ChevronLeft className="size-6" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={index === photos.length - 1}
          aria-label="Photo suivante"
          className="absolute right-3 top-1/2 hidden size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20 disabled:opacity-0 sm:flex"
        >
          <ChevronRight className="size-6" aria-hidden />
        </button>
      </div>

      <div className="flex min-h-16 items-center gap-3 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3">
        <p className="min-w-0 flex-1 truncate text-sm text-white/80">{photo.caption}</p>
        {onDelete ? (
          <button
            type="button"
            onClick={() => onDelete(photo)}
            className="flex h-11 shrink-0 items-center gap-2 rounded-full bg-white/10 px-4 text-sm text-red-300 transition-colors hover:bg-white/20"
          >
            <Trash2 className="size-4" aria-hidden />
            Supprimer
          </button>
        ) : null}
      </div>
    </div>
  );
}
