import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getAlbum, getPhotosPage, deletePhoto, deleteAlbum } from "@/lib/albums.functions";
import type { GridPhoto } from "@/lib/albums";
import { isPhotoFile } from "@/lib/photo-intake";
import { dropUpload, enqueuePhotos, retryUpload, type UploadItem } from "@/lib/upload-queue";
import { useUploadSnapshot } from "@/hooks/use-uploads";
import { PhotoViewer, type ViewerItem } from "@/components/PhotoViewer";

export const Route = createFileRoute("/_authenticated/albums/$albumId")({
  head: () => ({
    meta: [
      { title: "Album — Anthologie" },
      {
        name: "description",
        content: "Consultez les photographies de votre album et ajoutez-en de nouvelles.",
      },
      { property: "og:title", content: "Album — Anthologie" },
      {
        property: "og:description",
        content: "Consultez les photographies de votre album et ajoutez-en de nouvelles.",
      },
    ],
  }),
  component: AlbumDetailPage,
});

const PAGE_SIZE = 60;
/** Priorité haute : de quoi remplir le premier écran sans attendre. */
const EAGER_COUNT = 9;

type Tile =
  | { kind: "photo"; key: string; photo: GridPhoto; upload: UploadItem | undefined }
  | { kind: "local"; key: string; upload: UploadItem }
  | { kind: "placeholder"; key: string };

/** Trois colonnes sur téléphone, quatre à partir de la tablette. */
function useColumns() {
  const [columns, setColumns] = useState(3);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)");
    const update = () => setColumns(query.matches ? 4 : 3);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return columns;
}

function AlbumDetailPage() {
  const { albumId } = Route.useParams();
  const fetchAlbum = useServerFn(getAlbum);
  const fetchPage = useServerFn(getPhotosPage);
  const removePhoto = useServerFn(deletePhoto);
  const removeAlbum = useServerFn(deleteAlbum);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  const albumQuery = useQuery({
    queryKey: ["album", albumId],
    queryFn: () => fetchAlbum({ data: { albumId } }),
  });

  // Par pages de 60 : un album de 200 photos ne se charge plus d'un bloc.
  const photosQuery = useInfiniteQuery({
    queryKey: ["photos-page", albumId],
    queryFn: ({ pageParam }) =>
      fetchPage({ data: { albumId, offset: pageParam, limit: PAGE_SIZE } }),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset ?? undefined,
  });

  const photos = useMemo(
    () => photosQuery.data?.pages.flatMap((page) => page.photos) ?? [],
    [photosQuery.data],
  );
  const total = photosQuery.data?.pages[0]?.total ?? photos.length;

  const uploads = useUploadSnapshot();
  const albumUploads = useMemo(
    () => uploads.items.filter((item) => item.albumId === albumId),
    [uploads, albumId],
  );
  const uploadById = useMemo(
    () => new Map(albumUploads.map((item) => [item.photoId, item])),
    [albumUploads],
  );
  const uploadsActive = albumUploads.filter(
    (item) => item.stage === "analyse" || item.stage === "enregistrement" || item.stage === "envoi",
  ).length;

  // Photos chargées, puis places réservées pour celles des pages suivantes,
  // puis celles qui n'ont pas encore leur ligne en base (examen en cours).
  const tiles = useMemo(() => {
    const list: Tile[] = photos.map((photo) => ({
      kind: "photo",
      key: photo.id,
      photo,
      upload: uploadById.get(photo.id),
    }));
    for (let index = photos.length; index < total; index += 1) {
      list.push({ kind: "placeholder", key: "attente-" + index });
    }
    for (const upload of albumUploads) {
      if (!upload.rowCreated && upload.stage !== "doublon") {
        list.push({ kind: "local", key: upload.photoId, upload });
      }
    }
    return list;
  }, [photos, total, uploadById, albumUploads]);

  const columns = useColumns();
  const gridRef = useRef<HTMLDivElement>(null);
  const [gridWidth, setGridWidth] = useState(0);
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    const element = gridRef.current;
    if (!element) return;
    const measure = () => {
      setGridWidth(element.clientWidth);
      setScrollMargin(element.getBoundingClientRect().top + window.scrollY);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const gap = columns === 3 ? 4 : 12;
  const tileSize = gridWidth > 0 ? (gridWidth - gap * (columns - 1)) / columns : 120;
  const rowCount = Math.ceil(tiles.length / columns);

  const virtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: () => tileSize + gap,
    overscan: 3,
    scrollMargin,
  });
  useEffect(() => {
    virtualizer.measure();
  }, [tileSize, virtualizer]);

  const virtualRows = virtualizer.getVirtualItems();
  const lastVisibleRow = virtualRows[virtualRows.length - 1]?.index ?? 0;
  useEffect(() => {
    if (!photosQuery.hasNextPage || photosQuery.isFetchingNextPage) return;
    if (lastVisibleRow >= Math.ceil(photos.length / columns) - 2) void photosQuery.fetchNextPage();
  }, [lastVisibleRow, photos.length, columns, photosQuery]);

  // Filet de sécurité : les photos importées avant le LOT 2 n'ont pas leurs
  // proportions en base. La vignette affichée les donne, sans téléchargement
  // supplémentaire.
  const patched = useRef(new Set<string>());
  const rememberRatio = (photo: GridPhoto, image: HTMLImageElement) => {
    if (photo.aspect_ratio || !image.naturalWidth || patched.current.has(photo.id)) return;
    patched.current.add(photo.id);
    void supabase
      .from("photos")
      .update({ aspect_ratio: Number((image.naturalWidth / image.naturalHeight).toFixed(4)) })
      .eq("id", photo.id);
  };

  const handleFiles = async (files: FileList | null) => {
    const list = Array.from(files ?? []).filter(isPhotoFile);
    if (inputRef.current) inputRef.current.value = "";
    if (list.length === 0) return;

    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;
    if (!userId) {
      toast.error("Session expirée, reconnectez-vous.");
      return;
    }

    // Empreintes déjà présentes : une photo envoyée deux fois est ignorée.
    const { data: hashes } = await supabase
      .from("photos")
      .select("file_hash")
      .eq("album_id", albumId)
      .not("file_hash", "is", null);

    enqueuePhotos({
      albumId,
      userId,
      files: list.map((file) => ({ file })),
      startOrder: total,
      knownHashes: (hashes ?? [])
        .map((row) => row.file_hash)
        .filter((hash): hash is string => Boolean(hash)),
    });
    toast.success(
      list.length > 1 ? list.length + " photos en cours d’envoi." : "Photo en cours d’envoi.",
    );
  };

  const viewerPhotos = useMemo<ViewerItem[]>(
    () =>
      photos
        .filter((photo) => photo.displayUrl)
        .map((photo) => ({
          id: photo.id,
          signedUrl: photo.displayUrl as string,
          thumbUrl: photo.thumbUrl,
          caption: photo.caption,
        })),
    [photos],
  );
  const viewingIndex = viewing ? viewerPhotos.findIndex((photo) => photo.id === viewing) : -1;

  const handleDeletePhoto = async (item: ViewerItem) => {
    // La photo est retirée du stockage en même temps que de la base : il n'y a
    // pas de corbeille, et l'original est resté sur le téléphone.
    if (!window.confirm("Supprimer définitivement cette photo de l’album ?")) return;
    const photo = photos.find((candidate) => candidate.id === item.id);
    if (!photo) return;

    try {
      dropUpload(photo.id);
      await removePhoto({ data: { photoId: photo.id, storagePath: photo.storage_path } });
      const next = viewerPhotos[viewingIndex + 1] ?? viewerPhotos[viewingIndex - 1];
      setViewing(next && next.id !== photo.id ? next.id : null);
      await queryClient.invalidateQueries({ queryKey: ["photos-page", albumId] });
      await queryClient.invalidateQueries({ queryKey: ["albums"] });
      toast.success("Photo supprimée.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression impossible");
    }
  };

  const handleDeleteAlbum = async () => {
    if (!window.confirm("Supprimer cet album et toutes ses photos ?")) return;
    try {
      await removeAlbum({ data: { albumId } });
      await queryClient.invalidateQueries({ queryKey: ["albums"] });
      toast.success("Album supprimé.");
      navigate({ to: "/albums" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression impossible");
    }
  };

  const addLabel =
    uploadsActive > 0 ? "Envoi de " + uploadsActive + " photo(s)…" : "Ajouter des photos";

  return (
    <div className="px-4 pb-32 pt-8 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-6xl">
        <Link
          to="/albums"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Mes albums
        </Link>

        <div className="mt-5 flex flex-col gap-5 sm:mt-6 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="max-w-[52ch]">
            <h1 className="font-serif text-3xl text-foreground sm:text-4xl">
              {albumQuery.data?.title ??
                (albumQuery.isLoading ? "Chargement…" : "Album introuvable")}
            </h1>
            {albumQuery.data?.description ? (
              <p className="mt-3 text-sm leading-relaxed text-foreground/70">
                {albumQuery.data.description}
              </p>
            ) : (
              // Ligne réservée : sans elle, la description qui arrive après
              // coup pousse toute la grille vers le bas.
              <p className="mt-3 h-5" aria-hidden />
            )}
            <p className="mt-2 text-sm text-foreground/50">
              {total} photographie{total > 1 ? "s" : ""}
              {uploads.failed > 0 ? " · " + uploads.failed + " envoi(s) en échec" : ""}
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,.heic,.heif"
            multiple
            className="hidden"
            onChange={(event) => handleFiles(event.target.files)}
          />
          {/* Sur grand écran, les actions restent en tête de page. */}
          <div className="hidden flex-wrap gap-3 sm:flex">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {addLabel}
            </button>
            <Link
              to="/albums/book/$albumId"
              params={{ albumId }}
              className="inline-flex items-center justify-center rounded-full bg-terre px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-terre/90"
            >
              Voir mon livre
            </Link>
            <button
              type="button"
              onClick={handleDeleteAlbum}
              className="inline-flex items-center justify-center rounded-full border border-input bg-background px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              Supprimer l’album
            </button>
          </div>
        </div>

        <div className="mt-8 sm:mt-12">
          <div ref={gridRef} className="-mx-4 sm:mx-0">
            {/* On attend les données elles-mêmes : isLoading repasse à faux avant
              leur arrivée, et l'album paraissait vide une demi-seconde. */}
            {!photosQuery.data || gridWidth === 0 ? (
              // Gabarit tant que la largeur n'est pas mesurée : dessiner la
              // grille avec une taille de tuile provisoire faisait glisser
              // toutes les rangées au premier recalcul.
              <div className="grid min-h-[100svh] grid-cols-3 content-start gap-1 sm:gap-3 md:grid-cols-4">
                {Array.from({ length: 18 }, (_, index) => (
                  <div key={index} className="aspect-square animate-pulse bg-muted sm:rounded-xl" />
                ))}
              </div>
            ) : tiles.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-border px-8 py-20 text-center">
                <h3 className="font-serif text-2xl text-foreground">Album vide</h3>
                <p className="mx-auto mt-3 max-w-[42ch] text-sm text-muted-foreground">
                  Ajoutez vos premières photographies pour composer cette collection.
                </p>
              </div>
            ) : (
              // Grille virtualisée : seules les rangées visibles existent dans la
              // page, même pour un album de mille photos.
              // Hauteur calculée nous-mêmes : le virtualiseur annonce 0 au premier
              // rendu, et la page se rétractait d'un coup (le pied de page
              // remontait de 541 px) avant de se déployer.
              <div
                style={{
                  position: "relative",
                  height: Math.max(virtualizer.getTotalSize(), rowCount * (tileSize + gap)),
                }}
              >
                {virtualRows.map((row) => (
                  <div
                    key={row.key}
                    className="absolute inset-x-0 top-0 grid"
                    style={{
                      transform: "translateY(" + (row.start - scrollMargin) + "px)",
                      gridTemplateColumns: "repeat(" + columns + ", minmax(0, 1fr))",
                      gap,
                      height: tileSize,
                    }}
                  >
                    {tiles
                      .slice(row.index * columns, row.index * columns + columns)
                      .map((tile, column) => (
                        <GridTile
                          key={tile.key}
                          tile={tile}
                          position={row.index * columns + column}
                          onOpen={setViewing}
                          onLoaded={rememberRatio}
                        />
                      ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handleDeleteAlbum}
          className="mt-10 text-sm text-destructive underline underline-offset-4 sm:hidden"
        >
          Supprimer l’album
        </button>
      </div>

      {/* Sur téléphone, les deux actions utiles sous le pouce. */}
      <div className="above-mobile-nav fixed inset-x-3 z-40 flex gap-2 rounded-full border border-border bg-card/95 p-1.5 shadow-lg backdrop-blur sm:hidden">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex-1 truncate rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
        >
          {addLabel}
        </button>
        <Link
          to="/albums/book/$albumId"
          params={{ albumId }}
          className="flex flex-1 items-center justify-center rounded-full bg-terre px-4 py-3 text-sm font-medium text-white"
        >
          Mon livre
        </Link>
      </div>

      {viewingIndex >= 0 ? (
        <PhotoViewer
          photos={viewerPhotos}
          index={viewingIndex}
          onIndexChange={(next) => setViewing(viewerPhotos[next]?.id ?? null)}
          onClose={() => setViewing(null)}
          onDelete={(photo) => void handleDeletePhoto(photo)}
        />
      ) : null}
    </div>
  );
}

function GridTile({
  tile,
  position,
  onOpen,
  onLoaded,
}: {
  tile: Tile;
  position: number;
  onOpen: (photoId: string) => void;
  onLoaded: (photo: GridPhoto, image: HTMLImageElement) => void;
}) {
  if (tile.kind === "placeholder") {
    return <div className="size-full animate-pulse bg-muted sm:rounded-xl" />;
  }

  const photo = tile.kind === "photo" ? tile.photo : null;
  const upload = tile.kind === "photo" ? tile.upload : tile.upload;
  const source = photo?.thumbUrl ?? upload?.previewUrl ?? null;
  const failed = upload?.stage === "échec" || (!upload && photo?.upload_status === "failed");
  const sending =
    !failed && (upload ? upload.stage !== "terminé" : photo?.upload_status === "uploading");
  const openable = Boolean(photo?.displayUrl) && !sending;

  return (
    <button
      type="button"
      onClick={() => {
        if (failed && upload) retryUpload(upload.photoId);
        else if (openable && photo) onOpen(photo.id);
      }}
      aria-label={
        failed
          ? upload
            ? "Envoi en échec : réessayer"
            : "Photo incomplète : à réimporter"
          : sending
            ? "Photo en cours d’envoi"
            : "Voir la photo " + (position + 1) + " en grand"
      }
      className="group relative size-full overflow-hidden bg-muted sm:rounded-xl"
      style={photo?.dominant_color ? { backgroundColor: photo.dominant_color } : undefined}
    >
      {source ? (
        <img
          src={source}
          alt={photo?.caption ?? ""}
          loading={position < EAGER_COUNT ? "eager" : "lazy"}
          fetchPriority={position < EAGER_COUNT ? "high" : "auto"}
          decoding="async"
          onLoad={(event) => {
            event.currentTarget.dataset["loaded"] = "true";
            if (photo && photo.thumbUrl) onLoaded(photo, event.currentTarget);
          }}
          className="size-full object-cover opacity-0 transition-opacity duration-300 group-hover:scale-[1.03] data-[loaded=true]:opacity-100"
        />
      ) : null}

      {sending ? (
        <span className="absolute inset-x-2 bottom-2 block h-1 overflow-hidden rounded-full bg-black/40">
          <span
            className="block h-full bg-white transition-[width]"
            style={{ width: Math.round((upload?.progress ?? 0) * 100) + "%" }}
          />
        </span>
      ) : null}

      {failed ? (
        <span className="absolute inset-0 flex items-center justify-center bg-black/60 px-2 text-center text-[11px] font-medium leading-tight text-white">
          {upload ? "Envoi échoué" : "Photo incomplète"}
          <br />
          {upload ? "Toucher pour réessayer" : "À réimporter"}
        </span>
      ) : null}
    </button>
  );
}
