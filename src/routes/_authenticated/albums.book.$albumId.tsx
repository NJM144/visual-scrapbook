import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getAlbumForExport, getPhotosForExport, updateAlbumBook } from "@/lib/albums.functions";
import { BOOK_THEMES, findTheme } from "@/lib/book-themes";
import { PRINT_FORMATS, findFormat, spineWidthMm, effectiveDpi } from "@/lib/print-formats";
import { planBook } from "@/lib/book-layout";
import { CoverPreview } from "@/components/CoverPreview";

export const Route = createFileRoute("/_authenticated/albums/book/$albumId")({
  head: () => ({
    meta: [
      { title: "Livre imprimable — Anthologie" },
      {
        name: "description",
        content:
          "Choisissez un thème, un format, décorez la couverture et exportez pour l’imprimerie.",
      },
    ],
  }),
  component: BookStudio,
});

/** Déclenche le téléchargement d'un fichier généré en mémoire. */
function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Laisse au navigateur le temps de démarrer le téléchargement.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function slugify(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "album"
  );
}

function BookStudio() {
  const { albumId } = Route.useParams();
  const fetchAlbum = useServerFn(getAlbumForExport);
  const fetchPhotos = useServerFn(getPhotosForExport);
  const saveBook = useServerFn(updateAlbumBook);

  const albumQuery = useQuery({
    queryKey: ["album-export", albumId],
    queryFn: () => fetchAlbum({ data: { albumId } }),
  });
  const photosQuery = useQuery({
    queryKey: ["photos-export", albumId],
    queryFn: () => fetchPhotos({ data: { albumId } }),
  });

  const [themeId, setThemeId] = useState("savane");
  const [formatId, setFormatId] = useState("carre_20");
  const [coverTitle, setCoverTitle] = useState("");
  const [coverSubtitle, setCoverSubtitle] = useState("");
  const [coverPhotoId, setCoverPhotoId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(
    null,
  );

  // Les réglages enregistrés deviennent l'état initial du formulaire.
  const album = albumQuery.data;
  useEffect(() => {
    if (!album) return;
    setThemeId(album.theme);
    setFormatId(album.page_format);
    setCoverTitle(album.cover_title ?? album.title);
    setCoverSubtitle(album.cover_subtitle ?? "");
    setCoverPhotoId(album.cover_photo_id);
  }, [album]);

  const photos = photosQuery.data ?? [];
  const theme = findTheme(themeId);
  const format = findFormat(formatId);

  const plan = useMemo(
    () => planBook(photos.length, formatId, theme),
    [photos.length, formatId, theme],
  );

  const spine = spineWidthMm(plan.pages.length, true);
  const coverPhoto = photos.find((p) => p.id === coverPhotoId) ?? photos[0];

  // Une photo réduite à 2048 px suffit jusqu'à ~17 cm de large ; au-delà,
  // l'imprimeur travaillera avec moins de 300 dpi. Autant le dire avant.
  const coverDpi = effectiveDpi(2048, format.widthMm);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveBook({
        data: {
          albumId,
          theme: themeId,
          pageFormat: formatId,
          coverTitle: coverTitle.trim() || null,
          coverSubtitle: coverSubtitle.trim() || null,
          coverPhotoId,
        },
      });
      toast.success("Réglages enregistrés.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    if (photos.length === 0) {
      toast.error("Cet album ne contient aucune photo.");
      return;
    }

    setExporting(true);
    setProgress({ done: 0, total: photos.length + 2, label: "Préparation…" });
    let release: (() => void) | undefined;

    try {
      // pdf-lib et le rendu canvas n'existent que dans le navigateur, et pèsent
      // lourd : les charger à la demande les tient hors du bundle serveur.
      const { exportBook, releaseExportCache } = await import("@/lib/print-export");
      release = releaseExportCache;

      const title = coverTitle.trim() || album?.title || "Album";
      const result = await exportBook({
        plan,
        theme,
        photos: photos.map((photo) => ({ id: photo.id, url: photo.signedUrl })),
        coverPhoto: coverPhoto ? { id: coverPhoto.id, url: coverPhoto.signedUrl } : undefined,
        meta: {
          title,
          subtitle: coverSubtitle.trim(),
          dateLabel: new Date(album?.created_at ?? Date.now()).toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "long",
            year: "numeric",
          }),
        },
        onProgress: (done, total, label) => setProgress({ done, total, label }),
      });

      const base = slugify(title);
      download(result.interior, base + "-interieur.pdf");
      download(result.cover, base + "-couverture.pdf");
      download(
        new Blob([result.spec], { type: "text/plain;charset=utf-8" }),
        base + "-fiche-technique.txt",
      );

      if (result.warnings.length > 0) {
        toast.warning(result.warnings.length + " photo(s) sous 240 dpi — voir la fiche technique.");
      } else {
        toast.success("Trois fichiers téléchargés.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export impossible");
    } finally {
      release?.();
      setExporting(false);
      setProgress(null);
    }
  };

  if (albumQuery.isLoading || photosQuery.isLoading) {
    return <p className="px-6 py-20 text-center text-sm text-muted-foreground">Chargement…</p>;
  }

  if (albumQuery.error) {
    return (
      <p className="px-6 py-20 text-center text-sm text-destructive">
        Album introuvable ou inaccessible.
      </p>
    );
  }

  return (
    <div className="px-6 py-12">
      <div className="mx-auto max-w-6xl">
        <Link
          to="/albums/$albumId"
          params={{ albumId }}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Retour à l’album
        </Link>

        <header className="mt-6 mb-10">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-terre">
            Livre imprimable
          </h2>
          <h1 className="font-serif text-4xl text-foreground md:text-5xl">
            {album?.title ?? "Album"}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {photos.length} photographie{photos.length > 1 ? "s" : ""} · {plan.pages.length} pages ·
            dos de {spine} mm
          </p>
        </header>

        <div className="grid gap-10 lg:grid-cols-[1fr_22rem]">
          <div className="space-y-10">
            {/* Thèmes */}
            <section>
              <h3 className="mb-1 font-serif text-2xl text-foreground">Thème</h3>
              <p className="mb-5 text-sm text-muted-foreground">
                Il décide du papier, de l’encre, de la typographie et du motif de couverture.
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {BOOK_THEMES.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setThemeId(option.id)}
                    title={option.description}
                    className={
                      "overflow-hidden rounded-2xl border text-left transition-colors " +
                      (themeId === option.id
                        ? "border-terre ring-2 ring-terre/40"
                        : "border-border hover:border-foreground/30")
                    }
                  >
                    <span
                      className="flex h-16 items-end gap-1 p-2"
                      style={{ backgroundColor: option.coverBackground }}
                    >
                      <span
                        className="size-4 rounded-full"
                        style={{ backgroundColor: option.paper }}
                      />
                      <span
                        className="size-4 rounded-full"
                        style={{ backgroundColor: option.accent }}
                      />
                    </span>
                    <span className="block px-3 py-2 text-sm font-medium text-foreground">
                      {option.label}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            {/* Format */}
            <section>
              <h3 className="mb-1 font-serif text-2xl text-foreground">Format</h3>
              <p className="mb-5 text-sm text-muted-foreground">
                Taille finie après coupe. Le fond perdu de 3 mm s’ajoute automatiquement.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {PRINT_FORMATS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setFormatId(option.id)}
                    className={
                      "rounded-2xl border p-4 text-left transition-colors " +
                      (formatId === option.id
                        ? "border-terre bg-terre/5"
                        : "border-border hover:bg-muted")
                    }
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-foreground">{option.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {option.widthMm} × {option.heightMm} mm
                      </span>
                    </span>
                    <span className="mt-1 block text-xs leading-snug text-muted-foreground">
                      {option.description}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            {/* Couverture */}
            <section>
              <h3 className="mb-1 font-serif text-2xl text-foreground">Couverture</h3>
              <p className="mb-5 text-sm text-muted-foreground">
                Le titre imprimé peut différer du nom de l’album dans l’application.
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
                  Titre
                  <input
                    type="text"
                    value={coverTitle}
                    onChange={(event) => setCoverTitle(event.target.value)}
                    maxLength={120}
                    className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm font-normal normal-case tracking-normal text-foreground outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
                <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
                  Sous-titre
                  <input
                    type="text"
                    value={coverSubtitle}
                    onChange={(event) => setCoverSubtitle(event.target.value)}
                    maxLength={160}
                    placeholder="Un lieu, une date, une dédicace…"
                    className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm font-normal normal-case tracking-normal text-foreground outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
              </div>

              <p className="mt-6 mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
                Photo de couverture
              </p>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {photos.map((photo) => (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => setCoverPhotoId(photo.id)}
                    className={
                      "size-20 shrink-0 overflow-hidden rounded-xl border-2 transition-colors " +
                      ((coverPhoto?.id ?? null) === photo.id
                        ? "border-terre"
                        : "border-transparent hover:border-border")
                    }
                  >
                    <img
                      src={photo.signedUrl}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </section>
          </div>

          {/* Colonne latérale : aperçu + export */}
          <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            <CoverPreview
              theme={theme}
              format={format}
              title={coverTitle || album?.title || "Album"}
              subtitle={coverSubtitle}
              photoUrl={coverPhoto?.signedUrl}
            />

            <dl className="rounded-2xl border border-border bg-card p-5 text-sm">
              <div className="flex justify-between py-1">
                <dt className="text-muted-foreground">Pages</dt>
                <dd className="text-foreground">{plan.pages.length}</dd>
              </div>
              <div className="flex justify-between py-1">
                <dt className="text-muted-foreground">dont blanches</dt>
                <dd className="text-foreground">{plan.paddingPages}</dd>
              </div>
              <div className="flex justify-between py-1">
                <dt className="text-muted-foreground">Largeur du dos</dt>
                <dd className="text-foreground">{spine} mm</dd>
              </div>
              <div className="flex justify-between py-1">
                <dt className="text-muted-foreground">Fond perdu</dt>
                <dd className="text-foreground">3 mm</dd>
              </div>
              <div className="flex justify-between border-t border-border py-1 pt-3">
                <dt className="text-muted-foreground">Couverture</dt>
                <dd className={coverDpi < 240 ? "text-destructive" : "text-foreground"}>
                  ≈ {coverDpi} dpi
                </dd>
              </div>
            </dl>

            {coverDpi < 240 ? (
              <p className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-xs leading-relaxed text-foreground">
                À ce format, vos photos passent sous 240 dpi : l’import les réduit à 2048 px de
                large. Le rendu restera correct de loin, mais un format plus petit sera plus net.
              </p>
            ) : null}

            <div className="space-y-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || exporting}
                className="w-full rounded-full border border-input bg-background px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
              >
                {saving ? "Enregistrement…" : "Enregistrer les réglages"}
              </button>
              <button
                type="button"
                onClick={handleExport}
                disabled={exporting || photos.length === 0}
                className="w-full rounded-full bg-terre px-6 py-3.5 text-sm font-medium text-white transition-colors hover:bg-terre/90 disabled:opacity-60"
              >
                {exporting ? "Génération…" : "Exporter pour l’imprimeur"}
              </button>
            </div>

            {progress ? (
              <div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-terre transition-[width]"
                    style={{
                      width: Math.round((progress.done / Math.max(1, progress.total)) * 100) + "%",
                    }}
                  />
                </div>
                <p className="mt-2 text-center text-xs text-muted-foreground">{progress.label}</p>
              </div>
            ) : null}

            <p className="text-xs leading-relaxed text-muted-foreground">
              Trois fichiers : l’intérieur, la couverture (dos compris) et une fiche technique à
              remettre à l’imprimeur. PDF en RVB — l’imprimeur convertit en CMJN.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
