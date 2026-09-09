import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAlbumsWithPreview } from "@/lib/albums.functions";

export const Route = createFileRoute("/_authenticated/albums/")({
  component: AlbumsIndex,
});

function AlbumsIndex() {
  const fetchAlbums = useServerFn(getAlbumsWithPreview);
  const { data, isLoading, error } = useQuery({
    queryKey: ["albums"],
    queryFn: () => fetchAlbums(),
  });

  return (
    <div className="px-6 py-16">
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 flex flex-wrap items-end justify-between gap-6">
          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-terre">
              Bibliothèque
            </h2>
            <h1 className="font-serif text-4xl text-foreground">Mes albums</h1>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/albums/import"
              className="inline-flex items-center justify-center rounded-full bg-terre px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-terre/90"
            >
              Importer depuis mon téléphone
            </Link>
            <Link
              to="/albums/new"
              className="inline-flex items-center justify-center rounded-full border border-input bg-background px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Album vide
            </Link>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="aspect-[4/5] animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">Impossible de charger vos albums.</p>
        ) : !data || data.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border px-8 py-20 text-center">
            <h3 className="font-serif text-2xl text-foreground">Aucun album pour l’instant</h3>
            <p className="mx-auto mt-3 max-w-[46ch] text-sm text-muted-foreground">
              Le plus simple : importez les photos de votre téléphone, elles se rangeront toutes
              seules par voyage et par date.
            </p>
            <Link
              to="/albums/import"
              className="mt-8 inline-flex items-center justify-center rounded-full bg-terre px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-terre/90"
            >
              Importer mes photos
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {data.map((album) => (
              <Link
                key={album.id}
                to="/albums/$albumId"
                params={{ albumId: album.id }}
                className="group block"
              >
                <div className="mb-4 overflow-hidden rounded-2xl bg-muted ring-1 ring-black/5">
                  <div className="flex aspect-[4/5] items-center justify-center">
                    {album.cover_url ? (
                      <img
                        src={album.cover_url}
                        alt={album.title}
                        loading="lazy"
                        className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <span className="font-serif text-3xl text-foreground/25">
                        {album.title.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>
                <h3 className="text-base font-medium text-foreground">{album.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {album.photo_count} photo{album.photo_count > 1 ? "s" : ""} ·{" "}
                  {new Date(album.created_at).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
