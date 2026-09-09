import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getAlbum, getPhotos, createPhoto, deletePhoto, deleteAlbum } from "@/lib/albums.functions";

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
  const [uploading, setUploading] = useState(false);

  const albumQuery = useQuery({
    queryKey: ["album", albumId],
    queryFn: () => fetchAlbum({ data: { albumId } }),
  });

  const photosQuery = useQuery({
    queryKey: ["photos", albumId],
    queryFn: () => fetchPhotos({ data: { albumId } }),
  });

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    let ok = 0;
    try {
      const { data: sessionData } = await supabase.auth.getUser();
      const userId = sessionData.user?.id;
      if (!userId) throw new Error("Session expirée");

      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop() ?? "jpg";
        const path = `${userId}/${albumId}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("photos").upload(path, file);
        if (uploadError) throw uploadError;
        await addPhoto({ data: { albumId, storagePath: path } });
        ok += 1;
      }
      toast.success(ok > 1 ? `${ok} photos ajoutées.` : "Photo ajoutée.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Envoi impossible");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
      await queryClient.invalidateQueries({ queryKey: ["photos", albumId] });
    }
  };

  const handleDeletePhoto = async (photoId: string, storagePath: string) => {
    try {
      await removePhoto({ data: { photoId, storagePath } });
      await queryClient.invalidateQueries({ queryKey: ["photos", albumId] });
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

  const photos = photosQuery.data ?? [];

  return (
    <div className="px-6 py-16">
      <div className="mx-auto max-w-6xl">
        <Link
          to="/albums"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Mes albums
        </Link>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-[52ch]">
            <h1 className="font-serif text-4xl text-foreground">
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
          <div className="flex flex-wrap gap-3">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {uploading ? "Envoi…" : "Ajouter des photos"}
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

        <div className="mt-12">
          {photosQuery.isLoading ? (
            <div className="columns-1 gap-6 space-y-6 md:columns-2 lg:columns-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="aspect-[3/4] animate-pulse rounded-[12px] bg-muted" />
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
            <div className="columns-1 gap-6 space-y-6 md:columns-2 lg:columns-3">
              {photos.map((photo) => (
                <figure
                  key={photo.id}
                  className="group relative overflow-hidden rounded-[12px] bg-muted ring-1 ring-black/5"
                >
                  <img
                    src={photo.signedUrl}
                    alt={photo.caption ?? "Photographie de l’album"}
                    loading="lazy"
                    className="w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => handleDeletePhoto(photo.id, photo.storage_path)}
                    className="absolute right-3 top-3 rounded-full bg-background/90 px-3 py-1.5 text-xs font-medium text-foreground opacity-0 transition-opacity hover:bg-background group-hover:opacity-100"
                  >
                    Supprimer
                  </button>
                </figure>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
