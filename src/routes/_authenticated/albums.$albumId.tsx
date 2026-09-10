import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getAlbum, getPhotos, createPhoto, deletePhoto, deleteAlbum } from "@/lib/albums.functions";
import { readExifMetadata } from "@/lib/exif";
import { uploadPhotoFile, uploadThumbnail } from "@/lib/photo-upload";
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

/** Envois menés de front : au-delà, un réseau mobile sature. */
const UPLOAD_CONCURRENCY = 3;

function AlbumDetailPage() {
  const { albumId } = Route.useParams();
  const fetchAlbum = useServerFn(getAlbum);
  const fetchPhotos = useServerFn(getPhotos);
  const addPhoto = useServerFn(createPhoto);
  const removePhoto = useServerFn(deletePhoto);
  const removeAlbum = useServerFn(deleteAlbum);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const uploading = progress !== null;

  const albumQuery = useQuery({
    queryKey: ["album", albumId],
    queryFn: () => fetchAlbum({ data: { albumId } }),
  });

  const photosQuery = useQuery({
    queryKey: ["photos", albumId],
    queryFn: () => fetchPhotos({ data: { albumId } }),
  });

  const photos = photosQuery.data ?? [];

  // Photos envoyées avant l'existence des miniatures : on les crée une fois,
  // en tâche de fond, pour que les visites suivantes ne téléchargent plus
  // les originaux pour une simple grille.
  const backfillStarted = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    const missing = (photosQuery.data ?? []).filter((photo) => !photo.thumbUrl && photo.signedUrl);
    if (backfillStarted.current || missing.length === 0) return;
    backfillStarted.current = true;

    void (async () => {
      let made = 0;
      for (const photo of missing) {
        if (!alive.current) return;
        try {
          const response = await fetch(photo.signedUrl);
          if (response.ok && (await uploadThumbnail(photo.storage_path, await response.blob()))) {
            made += 1;
          }
        } catch {
          // La prochaine visite réessaiera.
        }
      }
      if (made > 0 && alive.current) {
        void queryClient.invalidateQueries({ queryKey: ["photos", albumId] });
      }
    })();
  }, [photosQuery.data, albumId, queryClient]);

  const handleFiles = async (files: FileList | null) => {
    const list = Array.from(files ?? []).filter((file) => file.type.startsWith("image/"));
    if (list.length === 0) return;

    setProgress({ done: 0, total: list.length });
    let ok = 0;
    let failed = 0;
    try {
      const { data: sessionData } = await supabase.auth.getUser();
      const userId = sessionData.user?.id;
      if (!userId) throw new Error("Session expirée");

      // Les nouvelles photos se rangent après les existantes, dans l'ordre choisi.
      const start = photos.length;
      let cursor = 0;
      const worker = async () => {
        while (cursor < list.length) {
          const index = cursor;
          cursor += 1;
          const file = list[index];
          if (!file) continue;

          try {
            const meta = await readExifMetadata(file);
            // Compressée avant l'envoi : une photo de téléphone brute pèse
            // 4 Mo, c'est un forfait data qui fond en quelques albums.
            const { path } = await uploadPhotoFile(file, userId, albumId);
            await addPhoto({
              data: {
                albumId,
                storagePath: path,
                orderIndex: start + index,
                ...(meta.takenAt ? { takenAt: meta.takenAt.toISOString() } : {}),
                ...(meta.latitude !== null && meta.longitude !== null
                  ? { latitude: meta.latitude, longitude: meta.longitude }
                  : {}),
              },
            });
            ok += 1;
          } catch {
            failed += 1;
          } finally {
            setProgress((current) => (current ? { ...current, done: current.done + 1 } : current));
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, list.length) }, worker));

      if (failed > 0) toast.warning(ok + " photo(s) ajoutée(s), " + failed + " échec(s).");
      else toast.success(ok > 1 ? ok + " photos ajoutées." : "Photo ajoutée.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Envoi impossible");
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
      await queryClient.invalidateQueries({ queryKey: ["photos", albumId] });
      await queryClient.invalidateQueries({ queryKey: ["albums"] });
    }
  };

  const handleDeletePhoto = async (photo: ViewerItem) => {
    // La photo est retirée du stockage en même temps que de la base : il n'y a
    // pas de corbeille, et l'original est resté sur le téléphone.
    if (!window.confirm("Supprimer définitivement cette photo de l’album ?")) return;
    const target = photos.find((item) => item.id === photo.id);
    if (!target) return;

    try {
      await removePhoto({ data: { photoId: target.id, storagePath: target.storage_path } });
      const remaining = photos.length - 1;
      setViewing((current) =>
        current === null || remaining <= 0 ? null : Math.min(current, remaining - 1),
      );
      await queryClient.invalidateQueries({ queryKey: ["photos", albumId] });
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

  const uploadLabel = progress
    ? "Envoi " + progress.done + " / " + progress.total + "…"
    : "Ajouter des photos";

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
            ) : null}
            <p className="mt-2 text-sm text-foreground/50">
              {photos.length} photographie{photos.length > 1 ? "s" : ""}
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          {/* Sur grand écran, les actions restent en tête de page. */}
          <div className="hidden flex-wrap gap-3 sm:flex">
            <button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {uploadLabel}
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
          {photosQuery.isLoading ? (
            <div className="-mx-4 grid grid-cols-3 gap-1 sm:mx-0 sm:gap-3 md:grid-cols-4">
              {Array.from({ length: 9 }, (_, i) => (
                <div key={i} className="aspect-square animate-pulse bg-muted sm:rounded-xl" />
              ))}
            </div>
          ) : photos.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-border px-8 py-20 text-center">
              <h3 className="font-serif text-2xl text-foreground">Album vide</h3>
              <p className="mx-auto mt-3 max-w-[42ch] text-sm text-muted-foreground">
                Ajoutez vos premières photographies pour composer cette collection.
              </p>
            </div>
          ) : (
            // Grille serrée de trois colonnes, bord à bord sur téléphone : on y
            // voit quinze photos d'un coup d'œil, comme dans la galerie.
            <div className="-mx-4 grid grid-cols-3 gap-1 sm:mx-0 sm:gap-3 md:grid-cols-4">
              {photos.map((photo, index) => (
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => setViewing(index)}
                  aria-label={"Voir la photo " + (index + 1) + " en grand"}
                  className="group relative aspect-square overflow-hidden bg-muted sm:rounded-xl"
                >
                  <img
                    src={photo.thumbUrl || photo.signedUrl}
                    alt={photo.caption ?? "Photographie de l’album"}
                    loading="lazy"
                    decoding="async"
                    className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                </button>
              ))}
            </div>
          )}
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
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="relative flex-1 overflow-hidden rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:opacity-80"
        >
          {progress ? (
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 bg-white/20 transition-[width]"
              style={{ width: Math.round((progress.done / progress.total) * 100) + "%" }}
            />
          ) : null}
          <span className="relative">{uploadLabel}</span>
        </button>
        <Link
          to="/albums/book/$albumId"
          params={{ albumId }}
          className="flex flex-1 items-center justify-center rounded-full bg-terre px-4 py-3 text-sm font-medium text-white"
        >
          Mon livre
        </Link>
      </div>

      {viewing !== null && photos[viewing] ? (
        <PhotoViewer
          photos={photos}
          index={viewing}
          onIndexChange={setViewing}
          onClose={() => setViewing(null)}
          onDelete={(photo) => void handleDeletePhoto(photo)}
        />
      ) : null}
    </div>
  );
}
