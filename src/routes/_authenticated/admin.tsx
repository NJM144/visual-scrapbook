import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAllAlbumsForAdmin } from "@/lib/albums.functions";
import { findFormat } from "@/lib/print-formats";
import { findTheme } from "@/lib/book-themes";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [{ title: "Administration — Anthologie" }],
  }),
  component: AdminPage,
});

function AdminPage() {
  const fetchAlbums = useServerFn(getAllAlbumsForAdmin);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-albums"],
    queryFn: () => fetchAlbums(),
    retry: false,
  });

  return (
    <div className="px-6 py-16">
      <div className="mx-auto max-w-6xl">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-terre">
          Administration
        </h2>
        <h1 className="font-serif text-4xl text-foreground">Albums de tous les comptes</h1>
        <p className="mt-3 max-w-[60ch] text-sm text-muted-foreground">
          Préparez ici les fichiers destinés à l’imprimerie. L’accès est en lecture seule : les
          albums des clients ne peuvent être ni modifiés ni supprimés depuis cette page.
        </p>

        <div className="mt-10">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : error ? (
            <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6">
              <p className="text-sm text-foreground">
                {error instanceof Error ? error.message : "Accès refusé."}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Le rôle administrateur s’attribue depuis la base : insérez une ligne dans{" "}
                <code className="rounded bg-muted px-1 py-0.5">public.user_roles</code> avec le rôle{" "}
                <code className="rounded bg-muted px-1 py-0.5">admin</code>. Il n’est volontairement
                pas attribuable depuis l’application.
              </p>
            </div>
          ) : !data || data.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border px-6 py-16 text-center text-sm text-muted-foreground">
              Aucun album pour l’instant.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="w-full min-w-[42rem] text-sm">
                <thead className="bg-muted/60 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium text-foreground">Album</th>
                    <th className="px-4 py-3 font-medium text-foreground">Compte</th>
                    <th className="px-4 py-3 font-medium text-foreground">Photos</th>
                    <th className="px-4 py-3 font-medium text-foreground">Thème</th>
                    <th className="px-4 py-3 font-medium text-foreground">Format</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {data.map((album) => (
                    <tr key={album.id} className="border-t border-border">
                      <td className="px-4 py-3">
                        <span className="block text-foreground">{album.title}</span>
                        <span className="block text-xs text-muted-foreground">
                          {new Date(album.created_at).toLocaleDateString("fr-FR")}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {album.user_id.slice(0, 8)}…
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{album.photo_count}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {findTheme(album.theme).label}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {findFormat(album.page_format).label}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to="/albums/book/$albumId"
                          params={{ albumId: album.id }}
                          className="inline-flex rounded-full bg-terre px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-terre/90"
                        >
                          Exporter
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
