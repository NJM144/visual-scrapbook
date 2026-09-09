import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  deletePhoto,
  getAlbumForExport,
  getIsAdmin,
  getPhotosForExport,
  reorderPhotos,
  saveAspectRatios,
  updateAlbumBook,
  updateAlbumLayout,
  updatePhotoCaption,
  updatePhotoFraming,
  updatePhotoMeta,
} from "@/lib/albums.functions";
import { BOOK_THEMES, findTheme } from "@/lib/book-themes";
import { PRINT_FORMATS, findFormat, spineWidthMm, effectiveDpi } from "@/lib/print-formats";
import { layoutFromPlan, planBook, planFromLayout, type AlbumLayout } from "@/lib/book-layout";
import { CoverPreview } from "@/components/CoverPreview";
import { COVER_TEMPLATES } from "@/lib/cover-templates";
import { BookPages } from "@/components/BookPages";
import { PhotoFramer } from "@/components/PhotoFramer";
import { PageComposer } from "@/components/PageComposer";
import { useAuth } from "@/hooks/use-auth";
import { describePhotoAI, suggestAlbumTextsAI } from "@/lib/ai.functions";
import { createAiThumbnail } from "@/lib/image-processing";
import { normalizeFraming, type Framing } from "@/lib/photo-framing";
import {
  analyzePhoto,
  photosNeedingAttention,
  recommendFormat,
  recommendTheme,
  type PhotoStats,
} from "@/lib/photo-analysis";

export const Route = createFileRoute("/_authenticated/albums/book/$albumId")({
  head: () => ({
    meta: [
      { title: "Mon livre — Anthologie" },
      {
        name: "description",
        content: "Feuilletez votre album, disposez les photos, ajoutez des légendes.",
      },
    ],
  }),
  component: BookStudio,
});

type Tab = "apercu" | "pages" | "mise-en-page" | "apparence";

const TABS: { id: Tab; label: string }[] = [
  { id: "apercu", label: "Feuilleter" },
  { id: "pages", label: "Pages" },
  { id: "mise-en-page", label: "Photos et légendes" },
  { id: "apparence", label: "Thème et format" },
];

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
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
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const fetchAlbum = useServerFn(getAlbumForExport);
  const fetchPhotos = useServerFn(getPhotosForExport);
  const fetchIsAdmin = useServerFn(getIsAdmin);
  const saveBook = useServerFn(updateAlbumBook);
  const saveCaption = useServerFn(updatePhotoCaption);
  const saveOrder = useServerFn(reorderPhotos);
  const saveLayout = useServerFn(updateAlbumLayout);
  const savePhotoMeta = useServerFn(updatePhotoMeta);
  const removePhoto = useServerFn(deletePhoto);
  const saveFraming = useServerFn(updatePhotoFraming);
  const saveAspects = useServerFn(saveAspectRatios);
  const describeAI = useServerFn(describePhotoAI);
  const suggestTexts = useServerFn(suggestAlbumTextsAI);

  const albumQuery = useQuery({
    queryKey: ["album-export", albumId],
    queryFn: () => fetchAlbum({ data: { albumId } }),
  });
  const photosQuery = useQuery({
    queryKey: ["photos-export", albumId],
    queryFn: () => fetchPhotos({ data: { albumId } }),
  });
  const { data: isAdmin } = useQuery({
    queryKey: ["is-admin"],
    queryFn: () => fetchIsAdmin(),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const [tab, setTab] = useState<Tab>("apercu");
  const [themeId, setThemeId] = useState("savane");
  const [formatId, setFormatId] = useState("carre_20");
  const [coverTitle, setCoverTitle] = useState("");
  const [coverSubtitle, setCoverSubtitle] = useState("");
  const [coverPhotoId, setCoverPhotoId] = useState<string | null>(null);
  const [coverTemplateId, setCoverTemplateId] = useState("photo_pleine");

  /** Ordre en cours d'édition, pas encore enregistré. */
  const [order, setOrder] = useState<string[]>([]);
  const [captions, setCaptions] = useState<Record<string, string>>({});
  const [framings, setFramings] = useState<Record<string, Framing>>({});
  const [openFramer, setOpenFramer] = useState<string | null>(null);
  const [orderDirty, setOrderDirty] = useState(false);
  const [moods, setMoods] = useState<Record<string, string>>({});
  const [peoples, setPeoples] = useState<Record<string, string>>({});

  /** Disposition manuelle ; `null` tant que l'auteur n'a rien réarrangé. */
  const [layout, setLayout] = useState<AlbumLayout | null>(null);
  const [layoutDirty, setLayoutDirty] = useState(false);

  const [analysis, setAnalysis] = useState<PhotoStats[] | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);
  const [aiStep, setAiStep] = useState<{ done: number; total: number; label: string } | null>(null);

  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(
    null,
  );

  const album = albumQuery.data;
  useEffect(() => {
    if (!album) return;
    setThemeId(album.theme);
    setFormatId(album.page_format);
    setCoverTitle(album.cover_title ?? album.title);
    setCoverSubtitle(album.cover_subtitle ?? "");
    setCoverPhotoId(album.cover_photo_id);
    setCoverTemplateId(album.cover_template);
    setLayout(album.layout);
    setLayoutDirty(false);
  }, [album]);

  const rawPhotos = useMemo(() => photosQuery.data ?? [], [photosQuery.data]);
  useEffect(() => {
    setOrder(rawPhotos.map((photo) => photo.id));
    setCaptions(Object.fromEntries(rawPhotos.map((photo) => [photo.id, photo.caption ?? ""])));
    setFramings(
      Object.fromEntries(
        rawPhotos.map((photo) => [
          photo.id,
          normalizeFraming({
            cropX: photo.crop_x,
            cropY: photo.crop_y,
            cropZoom: photo.crop_zoom,
            fit: photo.fit === "contain" ? "contain" : "cover",
          }),
        ]),
      ),
    );
    setMoods(Object.fromEntries(rawPhotos.map((photo) => [photo.id, photo.mood ?? ""])));
    setPeoples(
      Object.fromEntries(rawPhotos.map((photo) => [photo.id, (photo.people ?? []).join(", ")])),
    );
    setOrderDirty(false);
  }, [rawPhotos]);

  // Les photos dans l'ordre affiché, légendes en cours d'édition comprises :
  // l'aperçu doit refléter ce qu'on vient de taper, pas ce qu'il y a en base.
  const photos = useMemo(() => {
    const byId = new Map(rawPhotos.map((photo) => [photo.id, photo]));
    return order
      .map((id) => byId.get(id))
      .filter((photo): photo is (typeof rawPhotos)[number] => Boolean(photo))
      .map((photo) => ({
        ...photo,
        caption: captions[photo.id] ?? photo.caption,
        framing: framings[photo.id] ?? normalizeFraming(null),
      }));
  }, [order, rawPhotos, captions, framings]);

  // Un administrateur peut consulter et exporter l'album d'un client, mais la
  // RLS lui interdit d'y écrire. Sans ce test, les boutons d'édition seraient
  // visibles et échoueraient en silence.
  const isOwner = Boolean(user && album && album.user_id === user.id);

  const theme = findTheme(themeId);
  const format = findFormat(formatId);
  // Les rapports d'aspect guident le découpage des pages : deux photos
  // verticales côte à côte plutôt qu'empilées, c'est autant de rognage évité.
  const aspects = useMemo(() => photos.map((photo) => photo.aspect_ratio ?? 0), [photos]);
  const photoIds = useMemo(() => photos.map((photo) => photo.id), [photos]);

  // Le découpage automatique reste calculé même en disposition manuelle : c'est
  // lui qui sert de point de départ quand l'auteur ouvre l'onglet Pages.
  const autoPlan = useMemo(() => planBook(aspects, formatId, theme), [aspects, formatId, theme]);
  const plan = useMemo(
    () => (layout ? planFromLayout(layout, photoIds, aspects, formatId, theme) : autoPlan),
    [layout, photoIds, aspects, formatId, theme, autoPlan],
  );

  /** Rapport largeur/hauteur de l'emplacement occupé par chaque photo. */
  const slotAspects = useMemo(() => {
    const map = new Map<number, number>();
    for (const page of plan.pages) {
      for (const slot of page.slots) map.set(slot.photoIndex, slot.widthMm / slot.heightMm);
    }
    return map;
  }, [plan]);
  const spine = spineWidthMm(plan.pages.length, true);
  const coverPhoto = photos.find((photo) => photo.id === coverPhotoId) ?? photos[0];
  const coverDpi = effectiveDpi(2048, format.widthMm);
  const title = coverTitle.trim() || album?.title || "Album";
  const dateLabel = new Date(album?.created_at ?? Date.now()).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const move = (index: number, delta: number) => {
    setOrder((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;

      const next = [...current];
      const [moved] = next.splice(index, 1);
      if (!moved) return current;
      next.splice(target, 0, moved);
      return next;
    });
    setOrderDirty(true);
  };

  const commitCaption = async (photoId: string) => {
    const value = captions[photoId] ?? "";
    const original = rawPhotos.find((photo) => photo.id === photoId)?.caption ?? "";
    if (value.trim() === original.trim()) return;

    try {
      await saveCaption({ data: { photoId, caption: value.trim() || null } });
      await queryClient.invalidateQueries({ queryKey: ["photos-export", albumId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Légende non enregistrée");
    }
  };

  /**
   * Retire une photo de l'album.
   *
   * La case qu'elle occupait dans la disposition est libérée dans la foulée :
   * laisser un identifiant mort laisserait un trou que l'auteur ne pourrait ni
   * comprendre ni combler.
   */
  const handleDeletePhoto = async (photoId: string, storagePath: string) => {
    if (!window.confirm("Supprimer définitivement cette photo de l’album ?")) return;

    try {
      await removePhoto({ data: { photoId, storagePath } });

      if (layout) {
        const cleaned = {
          pages: layout.pages.map((page) => ({
            ...page,
            slots: page.slots.map((slot) => (slot === photoId ? null : slot)),
          })),
        };
        setLayout(cleaned);
        await saveLayout({ data: { albumId, layout: cleaned } });
      }

      await queryClient.invalidateQueries({ queryKey: ["photos-export", albumId] });
      await queryClient.invalidateQueries({ queryKey: ["photos", albumId] });
      await queryClient.invalidateQueries({ queryKey: ["albums"] });
      toast.success("Photo supprimée.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression impossible");
    }
  };

  const commitFraming = async (photoId: string, next: Framing) => {
    setFramings((current) => ({ ...current, [photoId]: next }));
    try {
      await saveFraming({
        data: {
          photoId,
          cropX: next.cropX,
          cropY: next.cropY,
          cropZoom: next.cropZoom,
          fit: next.fit,
        },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Cadrage non enregistré");
    }
  };

  /**
   * Analyse les photos : orientations, couleurs dominantes, perte au rognage.
   * Les rapports d'aspect mesurés sont enregistrés au passage — ce sont eux qui
   * permettent de composer les pages selon l'orientation réelle.
   */
  const runAnalysis = async () => {
    if (photos.length === 0) return;

    setAnalyzing(true);
    try {
      const results: PhotoStats[] = [];
      for (const photo of photos) {
        const stats = await analyzePhoto(photo.id, photo.signedUrl);
        if (stats) results.push(stats);
      }
      setAnalysis(results);

      const entries = results
        .filter((stats) => Number.isFinite(stats.aspect) && stats.aspect > 0)
        .map((stats) => ({ photoId: stats.id, aspectRatio: Number(stats.aspect.toFixed(4)) }));
      if (entries.length > 0) {
        await saveAspects({ data: { entries } });
        await queryClient.invalidateQueries({ queryKey: ["photos-export", albumId] });
      }

      toast.success(results.length + " photo(s) analysée(s).");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Analyse impossible");
    } finally {
      setAnalyzing(false);
    }
  };

  /**
   * Réajustement complet d'un album, y compris déjà composé.
   *
   * Le modèle de vision voit chaque photo et rend trois choses : une légende, la
   * position du sujet principal — qui devient le point focal du cadrage, donc
   * une réponse directe au rognage —, et s'il faut la montrer entière. Les
   * réglages sont enregistrés photo par photo : une coupure réseau à la
   * quinzième image laisse les quatorze premières acquises.
   */
  const runAiAdjust = async () => {
    if (photos.length === 0) return;

    setAiRunning(true);
    setAiStep({ done: 0, total: photos.length + 1, label: "Lecture des photos…" });

    const nextCaptions: Record<string, string> = { ...captions };
    const nextFramings: Record<string, Framing> = { ...framings };
    const nextMoods: Record<string, string> = { ...moods };
    let described = 0;
    let failed = 0;

    try {
      for (const [index, photo] of photos.entries()) {
        setAiStep({
          done: index,
          total: photos.length + 1,
          label: "Photo " + (index + 1) + " / " + photos.length,
        });

        try {
          const thumbnail = await createAiThumbnail(photo.signedUrl);
          if (!thumbnail) {
            failed += 1;
            continue;
          }

          const result = await describeAI({
            data: { imageBase64: thumbnail.base64, mimeType: thumbnail.mimeType },
          });

          const framing: Framing = normalizeFraming({
            cropX: result.focusX,
            cropY: result.focusY,
            cropZoom: 1,
            fit: result.wholeImage ? "contain" : "cover",
          });
          nextFramings[photo.id] = framing;
          await saveFraming({
            data: {
              photoId: photo.id,
              cropX: framing.cropX,
              cropY: framing.cropY,
              cropZoom: framing.cropZoom,
              fit: framing.fit,
            },
          });

          if (result.caption) {
            nextCaptions[photo.id] = result.caption;
            await saveCaption({ data: { photoId: photo.id, caption: result.caption } });
          }

          nextMoods[photo.id] = result.mood;
          await savePhotoMeta({
            data: {
              photoId: photo.id,
              mood: result.mood || null,
              faceCount: result.faceCount,
            },
          });
          described += 1;
        } catch {
          failed += 1;
        }
      }

      setCaptions(nextCaptions);
      setFramings(nextFramings);
      setMoods(nextMoods);

      // Titre et sous-titre, déduits des légendes obtenues.
      setAiStep({ done: photos.length, total: photos.length + 1, label: "Titre de couverture…" });
      const list = photos.map((photo) => nextCaptions[photo.id] ?? "").filter(Boolean);
      if (list.length > 0) {
        try {
          const texts = await suggestTexts({ data: { captions: list, dateLabel } });
          if (texts.title) setCoverTitle(texts.title);
          if (texts.subtitle) setCoverSubtitle(texts.subtitle);
        } catch {
          // Le titre est un bonus : son échec ne doit pas perdre les légendes.
        }
      }

      // Mesure locale ensuite : elle rafraîchit les photos depuis la base, donc
      // avec les valeurs que l'on vient d'y écrire.
      await runAnalysis();

      if (described === 0) toast.error("Aucune photo n'a pu être analysée.");
      else if (failed > 0)
        toast.warning(described + " photo(s) ajustée(s), " + failed + " échec(s).");
      else toast.success(described + " photo(s) ajustée(s). Vérifiez, puis enregistrez.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Réajustement impossible");
    } finally {
      setAiRunning(false);
      setAiStep(null);
    }
  };

  const formatAdvice = useMemo(() => (analysis ? recommendFormat(analysis) : []), [analysis]);
  const themeAdvice = useMemo(() => (analysis ? recommendTheme(analysis) : []), [analysis]);
  const attention = useMemo(
    () => (analysis ? photosNeedingAttention(analysis, format) : []),
    [analysis, format],
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveBook({
        data: {
          albumId,
          theme: themeId,
          pageFormat: formatId,
          coverTemplate: coverTemplateId,
          coverTitle: coverTitle.trim() || null,
          coverSubtitle: coverSubtitle.trim() || null,
          coverPhotoId,
        },
      });
      if (orderDirty) {
        await saveOrder({ data: { albumId, photoIds: order } });
        setOrderDirty(false);
      }
      if (layoutDirty) {
        await saveLayout({ data: { albumId, layout } });
        setLayoutDirty(false);
      }
      await queryClient.invalidateQueries({ queryKey: ["photos-export", albumId] });
      toast.success("Album enregistré.");
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

      const result = await exportBook({
        plan,
        theme,
        photos: photos.map((photo) => ({
          id: photo.id,
          url: photo.signedUrl,
          caption: photo.caption,
          framing: photo.framing,
        })),
        coverPhoto: coverPhoto ? { id: coverPhoto.id, url: coverPhoto.signedUrl } : undefined,
        coverTemplate: coverTemplateId,
        meta: { title, subtitle: coverSubtitle.trim(), dateLabel },
        onProgress: (done, total, label) => setProgress({ done, total, label }),
      });

      download(result.archive, slugify(title) + "-impression.zip");

      if (result.warnings.length > 0) {
        toast.warning(result.warnings.length + " photo(s) sous 240 dpi — voir la fiche technique.");
      } else {
        toast.success("Archive téléchargée.");
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
    <div className="px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <Link
          to="/albums/$albumId"
          params={{ albumId }}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Retour à l’album
        </Link>

        <header className="mt-6 mb-8 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-terre">
              Mon livre
            </h2>
            <h1 className="font-serif text-4xl text-foreground md:text-5xl">{title}</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              {photos.length} photographie{photos.length > 1 ? "s" : ""} · {plan.pages.length} pages
              · {format.label}
            </p>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full shrink-0 rounded-full bg-terre px-6 py-3.5 text-sm font-medium text-white transition-colors hover:bg-terre/90 disabled:opacity-60 sm:w-auto"
          >
            {saving
              ? "Enregistrement…"
              : orderDirty || layoutDirty
                ? "Enregistrer les changements"
                : "Enregistrer"}
          </button>
        </header>

        {album && !isOwner ? (
          <p className="mb-6 rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            Album d’un autre compte : consultation et export uniquement. Les modifications ne seront
            pas enregistrées.
          </p>
        ) : null}

        <div className="mb-8 -mx-4 flex gap-1 overflow-x-auto whitespace-nowrap border-b border-border px-4 sm:mx-0 sm:gap-2 sm:px-0">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                // Passer en disposition manuelle fige le découpage courant :
                // sans cela l'auteur n'aurait rien à réarranger.
                if (item.id === "pages" && !layout && photos.length > 0) {
                  setLayout(layoutFromPlan(autoPlan, photoIds));
                }
                setTab(item.id);
              }}
              className={
                "-mb-px shrink-0 border-b-2 px-4 py-3.5 text-sm font-medium transition-colors " +
                (tab === item.id
                  ? "border-terre text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground")
              }
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === "apercu" ? (
          <section>
            <div className="mb-10 max-w-sm">
              <CoverPreview
                theme={theme}
                format={format}
                title={title}
                subtitle={coverSubtitle}
                photoUrl={coverPhoto?.signedUrl}
                templateId={coverTemplateId}
              />
            </div>
            {photos.length === 0 ? (
              <p className="rounded-3xl border border-dashed border-border px-6 py-16 text-center text-sm text-muted-foreground">
                Ajoutez des photos à l’album pour composer le livre.
              </p>
            ) : (
              <BookPages
                plan={plan}
                theme={theme}
                photos={photos.map((photo) => ({
                  id: photo.id,
                  signedUrl: photo.signedUrl,
                  caption: photo.caption,
                  framing: photo.framing,
                }))}
                title={title}
                subtitle={coverSubtitle}
                dateLabel={dateLabel}
              />
            )}
          </section>
        ) : null}

        {tab === "pages" ? (
          <section>
            {photos.length === 0 ? (
              <p className="rounded-3xl border border-dashed border-border px-6 py-16 text-center text-sm text-muted-foreground">
                Ajoutez des photos à l’album pour composer les pages.
              </p>
            ) : layout ? (
              <>
                <PageComposer
                  layout={layout}
                  photos={photos.map((photo) => ({ id: photo.id, signedUrl: photo.signedUrl }))}
                  format={format}
                  theme={theme}
                  onChange={(next) => {
                    setLayout(next);
                    setLayoutDirty(true);
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    setLayout(null);
                    setLayoutDirty(true);
                  }}
                  className="mt-4 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
                >
                  Revenir à la disposition automatique
                </button>
              </>
            ) : null}
          </section>
        ) : null}

        {tab === "mise-en-page" ? (
          <section>
            <p className="mb-4 max-w-[70ch] text-sm text-muted-foreground">
              L’ordre ci-dessous est celui des pages. Déplacez une photo avec les flèches, écrivez
              sa légende, et cliquez sur <strong className="font-medium">Cadrer</strong> pour
              choisir ce qui reste visible dans le cadre.
            </p>

            <section className="mb-6 rounded-3xl border border-terre/40 bg-terre/5 p-6">
              <h3 className="font-serif text-2xl text-foreground">Réajuster avec l’IA</h3>
              <p className="mt-2 max-w-[68ch] text-sm text-muted-foreground">
                Un modèle de vision regarde chaque photo et en déduit une légende, la position du
                sujet — qui devient le point de cadrage, donc plus de visage coupé — et s’il faut la
                montrer entière. Il propose ensuite un titre de couverture. Fonctionne aussi sur un
                album déjà composé : les réglages existants sont remplacés.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Vos photos sont envoyées au service d’analyse pour cette opération, en version
                réduite.
              </p>

              <button
                type="button"
                onClick={runAiAdjust}
                disabled={aiRunning || photos.length === 0}
                className="mt-5 rounded-full bg-terre px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-terre/90 disabled:opacity-60"
              >
                {aiRunning ? "Analyse en cours…" : "Réajuster tout l’album"}
              </button>

              {aiStep ? (
                <div className="mt-5 max-w-md">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-terre transition-[width]"
                      style={{
                        width: Math.round((aiStep.done / Math.max(1, aiStep.total)) * 100) + "%",
                      }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{aiStep.label}</p>
                </div>
              ) : null}
            </section>

            {attention.length > 0 ? (
              <p className="mb-6 rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-foreground">
                {attention.length} photo(s) perdent plus de 30 % de leur surface au cadrage
                automatique dans ce format. Ouvrez leur cadrage, ou passez-les en «&nbsp;photo
                entière&nbsp;».
              </p>
            ) : null}
            <ol className="space-y-3">
              {photos.map((photo, index) => (
                <li key={photo.id} className="rounded-2xl border border-border bg-card p-3">
                  <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                    <span className="w-6 shrink-0 text-center text-sm text-muted-foreground">
                      {index + 1}
                    </span>
                    <img
                      src={photo.signedUrl}
                      alt=""
                      loading="lazy"
                      className="size-16 shrink-0 rounded-xl object-cover"
                    />
                    <input
                      type="text"
                      value={captions[photo.id] ?? ""}
                      maxLength={300}
                      placeholder="Légende (facultative)"
                      onChange={(event) =>
                        setCaptions((current) => ({ ...current, [photo.id]: event.target.value }))
                      }
                      onBlur={() => void commitCaption(photo.id)}
                      className="min-w-0 flex-1 basis-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring sm:basis-auto"
                    />
                    <span className="flex w-full shrink-0 justify-end gap-2 sm:w-auto sm:gap-1">
                      <button
                        type="button"
                        onClick={() => setOpenFramer(openFramer === photo.id ? null : photo.id)}
                        className={
                          "h-11 rounded-full border px-4 text-sm transition-colors " +
                          (openFramer === photo.id
                            ? "border-terre bg-terre/10"
                            : "border-input hover:bg-muted")
                        }
                      >
                        Cadrer
                      </button>
                      <button
                        type="button"
                        onClick={() => move(index, -1)}
                        disabled={index === 0}
                        aria-label="Déplacer avant"
                        className="size-11 rounded-full border border-input text-sm transition-colors hover:bg-muted disabled:opacity-40"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => move(index, 1)}
                        disabled={index === photos.length - 1}
                        aria-label="Déplacer après"
                        className="size-11 rounded-full border border-input text-sm transition-colors hover:bg-muted disabled:opacity-40"
                      >
                        ↓
                      </button>
                      {isOwner ? (
                        <button
                          type="button"
                          onClick={() => void handleDeletePhoto(photo.id, photo.storage_path)}
                          aria-label="Supprimer cette photo"
                          className="size-11 rounded-full border border-input text-destructive transition-colors hover:bg-destructive/10"
                        >
                          ✕
                        </button>
                      ) : null}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <input
                      type="text"
                      value={moods[photo.id] ?? ""}
                      maxLength={60}
                      placeholder="Ambiance (paisible, festif…)"
                      onChange={(event) =>
                        setMoods((current) => ({ ...current, [photo.id]: event.target.value }))
                      }
                      onBlur={() =>
                        void savePhotoMeta({
                          data: { photoId: photo.id, mood: moods[photo.id] ?? null },
                        }).catch(() => undefined)
                      }
                      className="rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                    {(photo.face_count ?? 0) > 0 ? (
                      <input
                        type="text"
                        value={peoples[photo.id] ?? ""}
                        maxLength={300}
                        placeholder={
                          photo.face_count === 1
                            ? "Qui est sur la photo ?"
                            : photo.face_count + " personnes — leurs noms, séparés par une virgule"
                        }
                        onChange={(event) =>
                          setPeoples((current) => ({ ...current, [photo.id]: event.target.value }))
                        }
                        onBlur={() =>
                          void savePhotoMeta({
                            data: {
                              photoId: photo.id,
                              people: (peoples[photo.id] ?? "")
                                .split(",")
                                .map((name) => name.trim())
                                .filter(Boolean),
                            },
                          }).catch(() => undefined)
                        }
                        className="rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                      />
                    ) : null}
                  </div>

                  {openFramer === photo.id ? (
                    <div className="mt-4 max-w-md border-t border-border pt-4">
                      <PhotoFramer
                        url={photo.signedUrl}
                        slotAspect={slotAspects.get(index) ?? 1}
                        framing={photo.framing}
                        paperColor={theme.paper}
                        onChange={(next) => void commitFraming(photo.id, next)}
                      />
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {tab === "apparence" ? (
          <div className="grid gap-10 lg:grid-cols-[1fr_20rem]">
            <div className="space-y-10">
              <section className="rounded-3xl border border-terre/40 bg-terre/5 p-6">
                <h3 className="font-serif text-2xl text-foreground">Analyse automatique</h3>
                <p className="mt-2 max-w-[64ch] text-sm text-muted-foreground">
                  Vos photos sont mesurées dans le navigateur — orientations, couleurs dominantes,
                  perte au rognage — pour proposer le format qui coupe le moins et la palette qui
                  s’accorde le mieux. Aucune image n’est envoyée ailleurs.
                </p>

                <button
                  type="button"
                  onClick={runAnalysis}
                  disabled={analyzing || photos.length === 0}
                  className="mt-5 rounded-full bg-terre px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-terre/90 disabled:opacity-60"
                >
                  {analyzing
                    ? "Analyse en cours…"
                    : analysis
                      ? "Relancer l’analyse"
                      : "Analyser mes photos"}
                </button>

                {analysis && formatAdvice[0] && themeAdvice[0] ? (
                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-border bg-background p-4">
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
                        Format conseillé
                      </p>
                      <p className="mt-2 text-base font-medium text-foreground">
                        {formatAdvice[0].format.label}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {formatAdvice[0].reason}
                      </p>
                      {formatId === formatAdvice[0].format.id ? (
                        <p className="mt-3 text-xs text-terre">Déjà sélectionné.</p>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setFormatId(formatAdvice[0]!.format.id)}
                          className="mt-3 rounded-full border border-input px-4 py-1.5 text-xs transition-colors hover:bg-muted"
                        >
                          Appliquer
                        </button>
                      )}
                    </div>

                    <div className="rounded-2xl border border-border bg-background p-4">
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
                        Thème conseillé
                      </p>
                      <p className="mt-2 text-base font-medium text-foreground">
                        {themeAdvice[0].theme.label}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {themeAdvice[0].reason}
                      </p>
                      <span className="mt-3 flex gap-1">
                        {analysis
                          .flatMap((stats) => stats.colors.slice(0, 2))
                          .slice(0, 8)
                          .map((rgb, index) => (
                            <span
                              key={index}
                              className="size-4 rounded-full ring-1 ring-black/10"
                              style={{
                                backgroundColor: "rgb(" + rgb.r + "," + rgb.g + "," + rgb.b + ")",
                              }}
                            />
                          ))}
                      </span>
                      {themeId === themeAdvice[0].theme.id ? (
                        <p className="mt-3 text-xs text-terre">Déjà sélectionné.</p>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setThemeId(themeAdvice[0]!.theme.id)}
                          className="mt-3 rounded-full border border-input px-4 py-1.5 text-xs transition-colors hover:bg-muted"
                        >
                          Appliquer
                        </button>
                      )}
                    </div>
                  </div>
                ) : null}
              </section>

              <section>
                <h3 className="mb-1 font-serif text-2xl text-foreground">Couverture</h3>
                <p className="mb-5 text-sm text-muted-foreground">
                  La composition. Le thème, lui, en donne les couleurs — les deux se combinent
                  librement.
                </p>
                <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:snap-none sm:gap-3 sm:overflow-visible sm:px-0 sm:grid-cols-3 lg:grid-cols-4">
                  {COVER_TEMPLATES.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setCoverTemplateId(option.id)}
                      className={
                        "w-40 shrink-0 snap-start rounded-2xl border p-3 text-left transition-colors sm:w-auto " +
                        (coverTemplateId === option.id
                          ? "border-terre bg-terre/5 ring-2 ring-terre/30"
                          : "border-border hover:bg-muted")
                      }
                    >
                      <span className="pointer-events-none block">
                        <CoverPreview
                          theme={theme}
                          format={format}
                          title={title}
                          subtitle=""
                          photoUrl={coverPhoto?.signedUrl}
                          templateId={option.id}
                          compact
                        />
                      </span>
                      <span className="mt-2 block text-sm font-medium text-foreground">
                        {option.label}
                      </span>
                      <span className="mt-0.5 hidden text-xs leading-snug text-muted-foreground sm:block">
                        {option.description}
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="mb-1 font-serif text-2xl text-foreground">Thème</h3>
                <p className="mb-5 text-sm text-muted-foreground">
                  Papier, encre, typographie et motif de couverture.
                </p>
                <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:snap-none sm:gap-3 sm:overflow-visible sm:px-0 sm:grid-cols-3 lg:grid-cols-5">
                  {BOOK_THEMES.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setThemeId(option.id)}
                      title={option.description}
                      className={
                        "w-32 shrink-0 snap-start overflow-hidden rounded-2xl border text-left transition-colors sm:w-auto " +
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

              <section>
                <h3 className="mb-1 font-serif text-2xl text-foreground">Format</h3>
                <p className="mb-5 text-sm text-muted-foreground">
                  Taille finie après coupe ; le fond perdu de 3 mm s’ajoute automatiquement.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {PRINT_FORMATS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setFormatId(option.id)}
                      className={
                        "min-h-[5.5rem] rounded-2xl border p-4 text-left transition-colors " +
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

            <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
              <CoverPreview
                theme={theme}
                format={format}
                title={title}
                subtitle={coverSubtitle}
                photoUrl={coverPhoto?.signedUrl}
                templateId={coverTemplateId}
              />

              <dl className="rounded-2xl border border-border bg-card p-5 text-sm">
                <div className="flex justify-between py-1">
                  <dt className="text-muted-foreground">Pages</dt>
                  <dd className="text-foreground">{plan.pages.length}</dd>
                </div>
                <div className="flex justify-between py-1">
                  <dt className="text-muted-foreground">Largeur du dos</dt>
                  <dd className="text-foreground">{spine} mm</dd>
                </div>
                <div className="flex justify-between border-t border-border py-1 pt-3">
                  <dt className="text-muted-foreground">Définition couverture</dt>
                  <dd className={coverDpi < 240 ? "text-destructive" : "text-foreground"}>
                    ≈ {coverDpi} dpi
                  </dd>
                </div>
              </dl>

              {coverDpi < 240 ? (
                <p className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-xs leading-relaxed text-foreground">
                  À ce format, vos photos passent sous 240 dpi : l’import les réduit à 2048 px de
                  large. Un format plus petit sera plus net.
                </p>
              ) : null}
            </aside>
          </div>
        ) : null}

        {/* L'export est réservé à l'administration : c'est elle qui traite avec
            l'imprimeur, et les fichiers de production n'ont pas à circuler. */}
        {isAdmin ? (
          <section className="mt-14 rounded-3xl border border-terre/40 bg-terre/5 p-6">
            <h3 className="font-serif text-2xl text-foreground">Fichiers d’impression</h3>
            <p className="mt-2 max-w-[64ch] text-sm text-muted-foreground">
              Une archive contenant l’intérieur, la couverture (dos de {spine} mm compris) et la
              fiche technique à joindre au bon de commande.
            </p>
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting || photos.length === 0}
              className="mt-5 rounded-full bg-terre px-6 py-3.5 text-sm font-medium text-white transition-colors hover:bg-terre/90 disabled:opacity-60"
            >
              {exporting ? "Génération…" : "Exporter pour l’imprimeur"}
            </button>

            {progress ? (
              <div className="mt-5 max-w-md">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-terre transition-[width]"
                    style={{
                      width: Math.round((progress.done / Math.max(1, progress.total)) * 100) + "%",
                    }}
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{progress.label}</p>
              </div>
            ) : null}
          </section>
        ) : (
          <p className="mt-14 rounded-2xl border border-border bg-muted/40 p-5 text-sm text-muted-foreground">
            Votre livre est prêt. L’équipe se charge de l’envoi à l’imprimerie : les fichiers de
            production sont générés depuis l’administration.
          </p>
        )}
      </div>
    </div>
  );
}
