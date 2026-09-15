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
import { findTheme } from "@/lib/book-themes";
import { findFormat, spineWidthMm, effectiveDpi, MIN_PRINT_DPI } from "@/lib/print-formats";
import { findWallpaper } from "@/lib/wallpapers";
import {
  layoutFromPlan,
  planBook,
  planFromLayout,
  withPrintPadding,
  type AlbumLayout,
} from "@/lib/book-layout";
import { CoverPreview } from "@/components/CoverPreview";
import { BookStylePicker } from "@/components/BookStylePicker";
import { BookPages, CAPTION_BAND_MM } from "@/components/BookPages";
import { BookEditor } from "@/components/BookEditor";
import { PhotoFramer } from "@/components/PhotoFramer";
import { useAuth } from "@/hooks/use-auth";
import { describePhotoAI, suggestAlbumTextsAI } from "@/lib/ai.functions";
import { createAiThumbnail } from "@/lib/image-processing";
import { PHOTO_EFFECTS, effectFilter } from "@/lib/photo-effects";
import { normalizeFraming, printedDpi, type Framing } from "@/lib/photo-framing";
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
      { title: "Mon livre — PhotoZo" },
      {
        name: "description",
        content: "Feuilletez votre album, disposez les photos, ajoutez des légendes.",
      },
    ],
  }),
  component: BookStudio,
});

type Tab = "apparence" | "livre";

/**
 * Deux étapes, pas davantage.
 *
 * Le coffret et le thème ouvrent la marche : le format décide du découpage des
 * pages et le thème de leurs marges, les choisir après avoir composé défaisait
 * la composition. Tout le reste — déplacer une photo, la cadrer, la légender,
 * ajouter ou retirer une page — se fait ensuite à même le livre, sur les pages
 * telles qu'elles s'imprimeront. Composer et regarder ne sont pas deux
 * moments : c'est le même.
 */
const TABS: { id: Tab; label: string }[] = [
  { id: "apparence", label: "Coffret et thème" },
  { id: "livre", label: "Mon livre" },
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

  const [tab, setTab] = useState<Tab>("apparence");
  const [themeId, setThemeId] = useState("savane");
  const [formatId, setFormatId] = useState("carre_20");
  const [coverTitle, setCoverTitle] = useState("");
  const [coverSubtitle, setCoverSubtitle] = useState("");
  const [coverPhotoId, setCoverPhotoId] = useState<string | null>(null);
  const [coverTemplateId, setCoverTemplateId] = useState("photo_pleine");
  /** Papiers peints ; `null` = fond uni du thème. */
  const [coverWallpaperId, setCoverWallpaperId] = useState<string | null>(null);
  const [pageWallpaperId, setPageWallpaperId] = useState<string | null>(null);

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
    setCoverWallpaperId(album.cover_wallpaper ?? null);
    setPageWallpaperId(album.page_wallpaper ?? null);
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
        // L'effet est une décision du livre : il vit dans la disposition, et
        // l'album continue d'afficher la photo d'origine.
        effect: layout?.effects?.[photo.id] ?? null,
      }));
  }, [order, rawPhotos, captions, framings, layout]);

  // Un administrateur peut consulter et exporter l'album d'un client, mais la
  // RLS lui interdit d'y écrire. Sans ce test, les boutons d'édition seraient
  // visibles et échoueraient en silence.
  const isOwner = Boolean(user && album && album.user_id === user.id);

  const theme = findTheme(themeId);
  const format = findFormat(formatId);
  // Les rapports d'aspect guident le découpage des pages : deux photos
  // verticales côte à côte plutôt qu'empilées, c'est autant de rognage évité.
  // Les dimensions enregistrées à l'import suffisent : plus besoin d'analyser
  // les photos avant de pouvoir composer selon leur orientation.
  const aspects = useMemo(
    () =>
      photos.map(
        (photo) =>
          photo.aspect_ratio ?? (photo.width && photo.height ? photo.width / photo.height : 0),
      ),
    [photos],
  );
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
  /**
   * Définition de chaque photo dans son emplacement, telle qu'elle sortira.
   *
   * Même prélèvement que l'export : le chiffre du badge est celui de la fiche
   * technique. Il suit le cadrage en direct — zoomer dans une photo la rend
   * plus molle, et l'auteur le voit avant l'imprimeur.
   */
  const dpiByIndex = useMemo(() => {
    const map = new Map<number, number>();
    for (const page of plan.pages) {
      for (const slot of page.slots) {
        const photo = photos[slot.photoIndex];
        if (!photo?.width || !photo.height) continue;
        const caption = photo.caption?.trim() ?? "";
        const imageHeight = caption ? Math.max(10, slot.heightMm - CAPTION_BAND_MM) : slot.heightMm;
        map.set(
          slot.photoIndex,
          printedDpi(photo.width, photo.height, slot.widthMm, imageHeight, photo.framing),
        );
      }
    }
    return map;
  }, [plan, photos]);
  const softCount = useMemo(
    () => [...dpiByIndex.values()].filter((dpi) => dpi < MIN_PRINT_DPI).length,
    [dpiByIndex],
  );
  // Ce que reçoit l'imprimeur : le livre complété en pages blanches. L'écran,
  // lui, ne montre que les pages composées.
  const printPlan = useMemo(() => withPrintPadding(plan), [plan]);
  const spine = spineWidthMm(printPlan.pages.length, true);

  /**
   * La disposition telle qu'elle est affichée, photos orphelines comprises.
   *
   * L'éditeur travaille dessus : chaque page vue correspond ainsi à une page
   * modifiable, au même rang, que la disposition ait été enregistrée ou
   * qu'elle vienne encore du découpage automatique.
   */
  const shownLayout = useMemo(
    () => layoutFromPlan(plan, photoIds, layout?.effects),
    [plan, photoIds, layout?.effects],
  );

  const applyLayout = (next: AlbumLayout) => {
    setLayout(next);
    setLayoutDirty(true);
  };

  /**
   * Pose ou retire l'effet d'une photo.
   *
   * On part de la disposition affichée quand rien n'a encore été réarrangé :
   * choisir un effet fige alors le découpage automatique, comme le fait déjà
   * le moindre réglage de page.
   */
  const setPhotoEffect = (photoId: string, effectId: string | null) => {
    const base = layout ?? shownLayout;
    const effects = { ...(base.effects ?? {}) };
    if (effectId) effects[photoId] = effectId;
    else delete effects[photoId];
    const { effects: _previous, ...rest } = base;
    applyLayout({ ...rest, ...(Object.keys(effects).length > 0 ? { effects } : {}) });
  };

  /**
   * Ce qu'on peut faire à une photo, tel qu'il s'ouvre en la touchant dans le
   * livre. Le studio garde la main dessus : c'est lui qui tient les légendes
   * en cours de frappe et sait les enregistrer.
   */
  const renderPhotoActions = (photoId: string, close: () => void) => {
    const index = photos.findIndex((photo) => photo.id === photoId);
    const photo = photos[index];
    if (!photo) return null;
    const dpi = dpiByIndex.get(index);

    return (
      <div className="space-y-3">
        {dpi !== undefined ? (
          <p
            className={
              "text-xs " +
              (dpi < MIN_PRINT_DPI ? "font-medium text-amber-700" : "text-muted-foreground")
            }
          >
            ≈ {dpi} dpi dans ce cadre
            {dpi < MIN_PRINT_DPI
              ? " — sortira floue à l’impression. Moins de zoom, ou une case plus petite."
              : " — nette à l’impression."}
          </p>
        ) : null}
        <div>
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
            Effet
          </span>
          {/* Chaque vignette montre l'effet sur cette photo-là : on choisit sur
              pièce, pas sur un nom. Ce que l'aperçu affiche est exactement ce
              que le PDF cuira dans les pixels. */}
          <div className="-mx-5 flex snap-x gap-2 overflow-x-auto px-5 pb-2">
            {[{ id: null, label: "Aucun", hint: "La photo telle quelle." }, ...PHOTO_EFFECTS].map(
              (effect) => {
                const active = (photo.effect ?? null) === effect.id;
                return (
                  <button
                    key={effect.id ?? "aucun"}
                    type="button"
                    onClick={() => setPhotoEffect(photo.id, effect.id)}
                    title={effect.hint}
                    aria-pressed={active}
                    className={
                      "w-[4.5rem] shrink-0 snap-start overflow-hidden rounded-xl border text-left transition-colors " +
                      (active
                        ? "border-terre ring-2 ring-terre/40"
                        : "border-border hover:border-foreground/30")
                    }
                  >
                    <img
                      src={photo.thumbUrl || photo.signedUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-14 w-full object-cover"
                      style={{ filter: effectFilter(effect.id) }}
                    />
                    <span className="block truncate px-1.5 py-1 text-[0.65rem] font-medium text-foreground">
                      {effect.label}
                    </span>
                  </button>
                );
              },
            )}
          </div>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
            Légende
          </span>
          <input
            type="text"
            value={captions[photo.id] ?? ""}
            maxLength={300}
            placeholder="Légende (facultative)"
            onChange={(event) =>
              setCaptions((current) => ({ ...current, [photo.id]: event.target.value }))
            }
            onBlur={() => void commitCaption(photo.id)}
            className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </label>

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
          className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
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
            className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        ) : null}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setOpenFramer(openFramer === photo.id ? null : photo.id)}
            className={
              "h-11 flex-1 rounded-full border px-4 text-sm transition-colors " +
              (openFramer === photo.id ? "border-terre bg-terre/10" : "border-input hover:bg-muted")
            }
          >
            {openFramer === photo.id ? "Fermer le cadrage" : "Cadrer"}
          </button>
          <button
            type="button"
            onClick={() => {
              close();
              void handleDeletePhoto(photo.id, photo.storage_path);
            }}
            className="h-11 rounded-full border border-input px-4 text-sm text-destructive transition-colors hover:bg-destructive/10"
          >
            Supprimer
          </button>
        </div>

        {openFramer === photo.id ? (
          <div className="border-t border-border pt-4">
            <PhotoFramer
              url={photo.signedUrl}
              slotAspect={slotAspects.get(index) ?? 1}
              framing={photo.framing}
              paperColor={theme.paper}
              onChange={(next) => void commitFraming(photo.id, next)}
            />
          </div>
        ) : null}
      </div>
    );
  };

  const coverPhoto = photos.find((photo) => photo.id === coverPhotoId) ?? photos[0];
  const coverWallpaper = findWallpaper(coverWallpaperId);
  const pageWallpaper = findWallpaper(pageWallpaperId);
  const coverDpi = effectiveDpi(2048, format.widthMm);
  const title = coverTitle.trim() || album?.title || "Album";
  const dateLabel = new Date(album?.created_at ?? Date.now()).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

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
        // La photo quitte ses cases et emporte son effet. Reconstruire la
        // disposition de zéro effacerait les effets des autres photos : on
        // repart de l'existant.
        const { [photoId]: _removed, ...keptEffects } = layout.effects ?? {};
        const cleaned: AlbumLayout = {
          ...layout,
          pages: layout.pages.map((page) => ({
            ...page,
            slots: page.slots.map((slot) => (slot === photoId ? null : slot)),
          })),
        };
        if (Object.keys(keptEffects).length > 0) cleaned.effects = keptEffects;
        else delete cleaned.effects;
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
        // Proportions et couleurs se lisent aussi bien sur la miniature :
        // inutile de faire télécharger chaque original au téléphone.
        const stats = await analyzePhoto(photo.id, photo.thumbUrl || photo.signedUrl);
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
          // La miniature de 640 px suffit au modèle, qui travaille en 512.
          const thumbnail = await createAiThumbnail(photo.thumbUrl || photo.signedUrl);
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
          coverWallpaper: coverWallpaperId,
          pageWallpaper: pageWallpaperId,
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

  const goToTab = (next: Tab) => {
    // Entrer dans le livre fige le découpage courant : sans cela l'auteur
    // n'aurait rien à réarranger.
    if (next === "livre" && !layout && photos.length > 0) {
      setLayout(layoutFromPlan(autoPlan, photoIds));
    }
    setTab(next);
  };

  const nextTab = TABS[TABS.findIndex((item) => item.id === tab) + 1];

  const continueTo = async (next: Tab) => {
    // Le coffret et le thème conditionnent tout ce qui suit : on les enregistre
    // en quittant l'étape plutôt que de compter sur un clic sur « Enregistrer ».
    if (tab === "apparence" && isOwner) await handleSave();
    goToTab(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleExport = async () => {
    if (photos.length === 0) {
      toast.error("Cet album ne contient aucune photo.");
      return;
    }
    // L'export ne part que des fichiers d'impression : jamais de la version
    // d'affichage, qui donnerait un livre flou.
    const missing = photos.filter((photo) => !photo.printUrl).length;
    if (missing > 0 || (coverPhoto && !coverPhoto.printUrl)) {
      toast.error(
        missing +
          " photo(s) sans fichier d’impression accessible. Rechargez la page ; si l’erreur persiste, ces photos sont encore en cours d’envoi.",
      );
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
        plan: printPlan,
        theme,
        photos: photos.map((photo) => ({
          id: photo.id,
          url: photo.printUrl as string,
          caption: photo.caption,
          framing: photo.framing,
          effect: photo.effect,
        })),
        coverPhoto: coverPhoto
          ? { id: coverPhoto.id, url: coverPhoto.printUrl as string, effect: coverPhoto.effect }
          : undefined,
        coverTemplate: coverTemplateId,
        coverWallpaper,
        pageWallpaper,
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
    <div className="px-4 pb-32 pt-8 sm:px-6 sm:py-12">
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
            <h1 className="font-serif text-3xl text-foreground sm:text-4xl md:text-5xl">{title}</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              {photos.length} photographie{photos.length > 1 ? "s" : ""} · {plan.pages.length} pages
              · {format.label}
            </p>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            // Sur téléphone, « Enregistrer » vit dans la barre du bas.
            className="hidden shrink-0 rounded-full bg-terre px-6 py-3.5 text-sm font-medium text-white transition-colors hover:bg-terre/90 disabled:opacity-60 sm:block"
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

        {/* Onglets collés sous l'en-tête sur téléphone : on change d'étape sans
            remonter tout le livre. */}
        <div className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-30 -mx-4 mb-8 flex gap-1 overflow-x-auto whitespace-nowrap border-b border-border bg-background/95 px-4 backdrop-blur sm:static sm:mx-0 sm:gap-2 sm:bg-transparent sm:px-0 sm:backdrop-blur-none">
          {TABS.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => goToTab(item.id)}
              className={
                "-mb-px shrink-0 border-b-2 px-4 py-3.5 text-sm font-medium transition-colors " +
                (tab === item.id
                  ? "border-terre text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground")
              }
            >
              <span className="mr-1.5 text-muted-foreground/60">{index + 1}.</span>
              {item.label}
            </button>
          ))}
        </div>

        {tab === "livre" ? (
          <section>
            <div className="mb-8 max-w-sm">
              <CoverPreview
                theme={theme}
                format={format}
                title={title}
                subtitle={coverSubtitle}
                photoUrl={coverPhoto?.signedUrl}
                photoEffect={coverPhoto?.effect}
                templateId={coverTemplateId}
                wallpaper={coverWallpaper}
              />
            </div>

            {photos.length === 0 ? (
              <p className="rounded-3xl border border-dashed border-border px-6 py-16 text-center text-sm text-muted-foreground">
                Ajoutez des photos à l’album pour composer le livre.
              </p>
            ) : (
              <>
                {isOwner ? (
                  <p className="mb-6 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
                    Voici votre livre tel qu’il s’imprimera.{" "}
                    <strong className="font-medium text-foreground">Touchez une photo</strong> pour
                    sa légende, son cadrage ou la retirer ;{" "}
                    <strong className="font-medium text-foreground">gardez le doigt appuyé</strong>{" "}
                    pour la déplacer vers une autre case. Sous chaque page : ajouter ou retirer un
                    emplacement, insérer une page, la supprimer.
                  </p>
                ) : null}

                {isOwner ? (
                  <section className="mb-6 rounded-3xl border border-terre/40 bg-terre/5 p-6">
                    <h3 className="font-serif text-2xl text-foreground">Réajuster avec l’IA</h3>
                    <p className="mt-2 max-w-[68ch] text-sm text-muted-foreground">
                      Un modèle de vision regarde chaque photo et en déduit une légende, la position
                      du sujet — qui devient le point de cadrage, donc plus de visage coupé — et
                      s’il faut la montrer entière. Il propose ensuite un titre de couverture.
                      Fonctionne aussi sur un album déjà composé : les réglages existants sont
                      remplacés.
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
                              width:
                                Math.round((aiStep.done / Math.max(1, aiStep.total)) * 100) + "%",
                            }}
                          />
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">{aiStep.label}</p>
                      </div>
                    ) : null}
                  </section>
                ) : null}

                {attention.length > 0 ? (
                  <p className="mb-6 rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-foreground">
                    {attention.length} photo(s) perdent plus de 30 % de leur surface au cadrage
                    automatique dans ce format. Touchez-les pour ouvrir leur cadrage, ou passez-les
                    en «&nbsp;photo entière&nbsp;».
                  </p>
                ) : null}

                {softCount > 0 ? (
                  <p className="mb-6 rounded-2xl border border-amber-600/40 bg-amber-50 p-4 text-sm leading-relaxed text-foreground dark:bg-amber-950/30">
                    {softCount} photo{softCount > 1 ? "s" : ""} sortira{softCount > 1 ? "ient" : ""}{" "}
                    floue{softCount > 1 ? "s" : ""} dans ce format : sous {MIN_PRINT_DPI} dpi, badge
                    orange dans le livre. Réduisez le zoom de la photo, donnez-lui une case plus
                    petite, ou choisissez un coffret plus petit.
                  </p>
                ) : null}

                {printPlan.paddingPages > 0 ? (
                  <p className="mb-6 rounded-2xl bg-muted/60 p-4 text-sm leading-relaxed text-muted-foreground">
                    Une reliure demande au moins 24 pages, par multiples de 4 : à l’impression,{" "}
                    {printPlan.paddingPages} page{printPlan.paddingPages > 1 ? "s" : ""} blanche
                    {printPlan.paddingPages > 1 ? "s" : ""} complétera
                    {printPlan.paddingPages > 1 ? "nt" : ""} la fin du livre. Ajoutez des pages pour
                    les remplir.
                  </p>
                ) : null}

                {isOwner ? (
                  <BookEditor
                    plan={plan}
                    layout={shownLayout}
                    onLayoutChange={applyLayout}
                    theme={theme}
                    photos={photos}
                    title={title}
                    subtitle={coverSubtitle}
                    dateLabel={dateLabel}
                    renderPhotoActions={renderPhotoActions}
                    dpiByIndex={dpiByIndex}
                    minDpi={MIN_PRINT_DPI}
                    wallpaper={pageWallpaper}
                  />
                ) : (
                  <BookPages
                    plan={plan}
                    theme={theme}
                    photos={photos}
                    title={title}
                    subtitle={coverSubtitle}
                    dateLabel={dateLabel}
                    dpiByIndex={dpiByIndex}
                    minDpi={MIN_PRINT_DPI}
                    wallpaper={pageWallpaper}
                  />
                )}

                {layout ? (
                  <button
                    type="button"
                    onClick={() => {
                      setLayout(null);
                      setLayoutDirty(true);
                    }}
                    className="mt-4 block text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
                  >
                    Revenir à la disposition automatique
                  </button>
                ) : null}
              </>
            )}
          </section>
        ) : null}

        {tab === "apparence" ? (
          <div className="grid gap-10 lg:grid-cols-[1fr_20rem]">
            {/* min-w-0 : sans lui, la colonne suit la largeur des rangées
                défilantes du sélecteur et la page déborde du téléphone. */}
            <div className="min-w-0 space-y-10">
              <BookStylePicker
                formatId={formatId}
                coverTemplateId={coverTemplateId}
                themeId={themeId}
                onFormatChange={setFormatId}
                onCoverTemplateChange={setCoverTemplateId}
                onThemeChange={setThemeId}
                coverWallpaperId={coverWallpaperId}
                pageWallpaperId={pageWallpaperId}
                onCoverWallpaperChange={setCoverWallpaperId}
                onPageWallpaperChange={setPageWallpaperId}
                title={title}
                photoUrl={coverPhoto?.signedUrl}
              />

              <section className="rounded-3xl border border-terre/40 bg-terre/5 p-6">
                <h3 className="font-serif text-2xl text-foreground">Besoin d’un conseil ?</h3>
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
                <h3 className="mb-1 font-serif text-2xl text-foreground">
                  Titre et photo de couverture
                </h3>
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
                        src={photo.thumbUrl || photo.signedUrl}
                        alt=""
                        loading="lazy"
                        decoding="async"
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
                photoEffect={coverPhoto?.effect}
                templateId={coverTemplateId}
                wallpaper={coverWallpaper}
              />

              <dl className="rounded-2xl border border-border bg-card p-5 text-sm">
                <div className="flex justify-between py-1">
                  <dt className="text-muted-foreground">Pages composées</dt>
                  <dd className="text-foreground">{plan.pages.length}</dd>
                </div>
                <div className="flex justify-between py-1">
                  <dt className="text-muted-foreground">Pages imprimées</dt>
                  <dd className="text-foreground">{printPlan.pages.length}</dd>
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

        {nextTab ? (
          <div className="mt-10 hidden justify-end sm:flex">
            <button
              type="button"
              onClick={() => void continueTo(nextTab.id)}
              disabled={saving}
              className="rounded-full bg-terre px-6 py-3.5 text-sm font-medium text-white transition-colors hover:bg-terre/90 disabled:opacity-60"
            >
              Continuer : {nextTab.label} →
            </button>
          </div>
        ) : null}

        {/* Sur téléphone : enregistrer et passer à l'étape suivante, sous le pouce. */}
        {isOwner || nextTab ? (
          <div className="above-mobile-nav fixed inset-x-3 z-40 flex gap-2 rounded-full border border-border bg-card/95 p-1.5 shadow-lg backdrop-blur sm:hidden">
            {isOwner ? (
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="flex-1 rounded-full border border-input bg-background px-4 py-3 text-sm font-medium text-foreground disabled:opacity-60"
              >
                {saving ? "…" : orderDirty || layoutDirty ? "Enregistrer •" : "Enregistrer"}
              </button>
            ) : null}
            {nextTab ? (
              <button
                type="button"
                onClick={() => void continueTo(nextTab.id)}
                disabled={saving}
                className="flex-[1.4] truncate rounded-full bg-terre px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
              >
                {nextTab.label} →
              </button>
            ) : null}
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
