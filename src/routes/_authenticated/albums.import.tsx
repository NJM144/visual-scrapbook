import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createAlbum, createPhoto } from "@/lib/albums.functions";
import { readExifMetadata } from "@/lib/exif";
import {
  dateBounds,
  filterByDateRange,
  fromDateInputValue,
  groupPhotos,
  toDateInputValue,
  type DatedPhoto,
  type GroupingMode,
  type PhotoGroup,
} from "@/lib/photo-grouping";
import { createThumbnail, formatBytes } from "@/lib/image-processing";
import { uploadPhotoFile } from "@/lib/photo-upload";
import { BookStylePicker } from "@/components/BookStylePicker";
import { DEFAULT_THEME_ID, findTheme } from "@/lib/book-themes";
import { DEFAULT_FORMAT_ID, findFormat } from "@/lib/print-formats";
import { DEFAULT_COVER_TEMPLATE, findCoverTemplate } from "@/lib/cover-templates";

export const Route = createFileRoute("/_authenticated/albums/import")({
  head: () => ({
    meta: [
      { title: "Importer depuis mon téléphone — Anthologie" },
      {
        name: "description",
        content:
          "Importez vos photos et laissez-les se ranger toutes seules en albums, par événement ou par date.",
      },
    ],
  }),
  component: ImportPage,
});

type Step = "style" | "select" | "analyzing" | "review" | "importing" | "done";

const MODES: { value: GroupingMode; label: string; hint: string }[] = [
  { value: "trip", label: "Par événement", hint: "Coupe l’album après plusieurs jours sans photo" },
  { value: "day", label: "Par journée", hint: "Un album par jour de prise de vue" },
  { value: "month", label: "Par mois", hint: "Un album par mois" },
  { value: "single", label: "Un seul album", hint: "Tout regrouper d’un bloc" },
];

/** Nombre d'envois menés de front : au-delà, un réseau mobile sature. */
const UPLOAD_CONCURRENCY = 3;

const PREVIEW_COUNT = 5;

function ImportPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const addAlbum = useServerFn(createAlbum);
  const addPhoto = useServerFn(createPhoto);
  const inputRef = useRef<HTMLInputElement>(null);

  // Le coffret et le thème viennent en premier : ils conditionnent la mise en
  // page de chaque album créé.
  const [step, setStep] = useState<Step>("style");
  const [formatId, setFormatId] = useState(DEFAULT_FORMAT_ID);
  const [coverTemplateId, setCoverTemplateId] = useState(DEFAULT_COVER_TEMPLATE);
  const [themeId, setThemeId] = useState(DEFAULT_THEME_ID);
  const [photos, setPhotos] = useState<DatedPhoto[]>([]);
  const [analyzed, setAnalyzed] = useState(0);
  const [totalToAnalyze, setTotalToAnalyze] = useState(0);

  const [mode, setMode] = useState<GroupingMode>("trip");
  const [gapDays, setGapDays] = useState(2);
  const [singleTitle, setSingleTitle] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [titles, setTitles] = useState<Record<string, string>>({});
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const [uploaded, setUploaded] = useState(0);
  const [createdAlbums, setCreatedAlbums] = useState(0);
  const [failures, setFailures] = useState(0);

  const filtered = useMemo(
    () => filterByDateRange(photos, fromDateInputValue(from), fromDateInputValue(to)),
    [photos, from, to],
  );

  const groups = useMemo(
    () => groupPhotos(filtered, { mode, gapDays, singleTitle }),
    [filtered, mode, gapDays, singleTitle],
  );

  const kept = groups.filter((group) => !excluded.has(group.id));
  const keptPhotoCount = kept.reduce((total, group) => total + group.photos.length, 0);
  const totalBytes = filtered.reduce((total, photo) => total + photo.file.size, 0);
  const exifCount = filtered.filter((photo) => photo.source === "exif").length;

  // Les identifiants de groupe dépendent du découpage : quand il change, les
  // titres personnalisés et les exclusions ne correspondent plus à rien.
  useEffect(() => {
    setTitles({});
    setExcluded(new Set());
  }, [mode, gapDays, from, to]);

  const handleFiles = async (fileList: FileList | null) => {
    const files = Array.from(fileList ?? []).filter((file) => file.type.startsWith("image/"));
    if (files.length === 0) {
      toast.error("Aucune image dans la sélection.");
      return;
    }

    setStep("analyzing");
    setTotalToAnalyze(files.length);
    setAnalyzed(0);

    const dated: DatedPhoto[] = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      if (!file) continue;

      // Une seule lecture d'en-tête pour la date et les coordonnées : les lire
      // séparément doublerait le travail sur des centaines de fichiers.
      const meta = await readExifMetadata(file);
      const takenAt = meta.takenAt ?? new Date(file.lastModified || Date.now());

      dated.push({
        id: index + "-" + file.size + "-" + file.name,
        file,
        takenAt,
        source: meta.takenAt ? "exif" : "file",
        latitude: meta.latitude,
        longitude: meta.longitude,
      });
      if (index % 8 === 0 || index === files.length - 1) setAnalyzed(index + 1);
    }

    const bounds = dateBounds(dated);
    if (bounds) {
      setFrom(toDateInputValue(bounds.min));
      setTo(toDateInputValue(bounds.max));
    }

    setPhotos(dated);
    setTitles({});
    setExcluded(new Set());
    setStep("review");
  };

  const resetDateFilter = () => {
    const bounds = dateBounds(photos);
    setFrom(bounds ? toDateInputValue(bounds.min) : "");
    setTo(bounds ? toDateInputValue(bounds.max) : "");
  };

  const toggleGroup = (groupId: string) => {
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  /** Envoie les photos d'un album, quelques-unes à la fois. */
  const uploadGroup = async (albumId: string, userId: string, group: PhotoGroup) => {
    let cursor = 0;
    let failed = 0;

    const worker = async () => {
      while (cursor < group.photos.length) {
        const index = cursor;
        cursor += 1;
        const photo = group.photos[index];
        if (!photo) continue;

        try {
          const { path } = await uploadPhotoFile(photo.file, userId, albumId);

          await addPhoto({
            data: {
              albumId,
              storagePath: path,
              orderIndex: index,
              takenAt: photo.takenAt.toISOString(),
              ...(photo.latitude !== null && photo.longitude !== null
                ? { latitude: photo.latitude, longitude: photo.longitude }
                : {}),
            },
          });
        } catch {
          failed += 1;
        } finally {
          setUploaded((count) => count + 1);
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(UPLOAD_CONCURRENCY, group.photos.length) }, worker),
    );
    return failed;
  };

  const startImport = async () => {
    if (kept.length === 0) return;

    setStep("importing");
    setUploaded(0);
    setCreatedAlbums(0);
    setFailures(0);

    let albumsDone = 0;
    let failed = 0;

    try {
      const { data: sessionData } = await supabase.auth.getUser();
      const userId = sessionData.user?.id;
      if (!userId) throw new Error("Session expirée, reconnectez-vous.");

      for (const group of kept) {
        const title = (titles[group.id] ?? group.title).trim() || group.title;
        const count = group.photos.length;
        const plural = count > 1 ? "s" : "";

        const album = await addAlbum({
          data: {
            title: title.slice(0, 120),
            description:
              count + " photo" + plural + " importée" + plural + " depuis mon téléphone.",
            theme: themeId,
            pageFormat: formatId,
            coverTemplate: coverTemplateId,
          },
        });

        failed += await uploadGroup(album.id, userId, group);
        albumsDone += 1;
        setCreatedAlbums(albumsDone);
      }

      setFailures(failed);
      await queryClient.invalidateQueries({ queryKey: ["albums"] });
      setStep("done");

      if (failed > 0) toast.warning(failed + " photo(s) n’ont pas pu être envoyées.");
      else toast.success(albumsDone + " album(s) créé(s).");
    } catch (error) {
      setStep("review");
      toast.error(error instanceof Error ? error.message : "Import impossible");
    }
  };

  return (
    <div className="px-6 py-12 md:py-16">
      <div className="mx-auto max-w-5xl">
        <Link
          to="/albums"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Mes albums
        </Link>

        <header className="mt-6 mb-10">
          <h2 className="mb-2 text-sm font-medium uppercase tracking-widest text-accent">
            Import automatique
          </h2>
          <h1 className="font-serif text-4xl text-foreground md:text-5xl">
            Vos photos se rangent toutes seules
          </h1>
          <p className="mt-4 max-w-[60ch] leading-relaxed text-foreground/70">
            Choisissez des photos dans la galerie de votre téléphone. Leur date de prise de vue
            suffit à retrouver vos fêtes et vos réunions de famille — un album pour chacun, sans
            rien saisir.
          </p>
        </header>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => handleFiles(event.target.files)}
        />

        {step === "style" ? (
          <div>
            <p className="mb-8 max-w-[62ch] text-sm leading-relaxed text-muted-foreground">
              Commencez par le coffret et le thème : chaque album créé les recevra. Ils décident de
              la mise en page, c’est pourquoi on les fixe avant les photos — vous pourrez encore les
              changer album par album.
            </p>
            <BookStylePicker
              formatId={formatId}
              coverTemplateId={coverTemplateId}
              themeId={themeId}
              onFormatChange={setFormatId}
              onCoverTemplateChange={setCoverTemplateId}
              onThemeChange={setThemeId}
              title="Mon album"
              withPreview
            />
            <div className="mt-10 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  if (photos.length > 0) {
                    setStep("review");
                    return;
                  }
                  setStep("select");
                  inputRef.current?.click();
                }}
                className="inline-flex w-full items-center justify-center rounded-full bg-primary px-8 py-4 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:w-auto"
              >
                {photos.length > 0 ? "Revenir au découpage" : "Continuer : choisir mes photos"}
              </button>
            </div>
          </div>
        ) : null}

        {step === "select" ? <SelectStep onPick={() => inputRef.current?.click()} /> : null}

        {step === "analyzing" ? (
          <ProgressPanel
            title="Lecture des dates de prise de vue…"
            detail={analyzed + " / " + totalToAnalyze + " photos analysées"}
            value={totalToAnalyze === 0 ? 0 : analyzed / totalToAnalyze}
          />
        ) : null}

        {step === "importing" ? (
          <ProgressPanel
            title="Envoi en cours…"
            detail={
              uploaded +
              " / " +
              keptPhotoCount +
              " photos · " +
              createdAlbums +
              " / " +
              kept.length +
              " albums"
            }
            value={keptPhotoCount === 0 ? 0 : uploaded / keptPhotoCount}
          />
        ) : null}

        {step === "done" ? (
          <DoneStep
            albums={createdAlbums}
            photos={uploaded - failures}
            failures={failures}
            onSeeAlbums={() => navigate({ to: "/albums" })}
            onImportMore={() => {
              setStep("select");
              setPhotos([]);
              if (inputRef.current) inputRef.current.value = "";
            }}
          />
        ) : null}

        {step === "review" ? (
          <div className="space-y-8">
            <p className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl border border-border bg-card px-5 py-3 text-sm text-muted-foreground">
              <span>
                Coffret{" "}
                <strong className="font-medium text-foreground">
                  {findFormat(formatId).label}
                </strong>{" "}
                · couverture{" "}
                <strong className="font-medium text-foreground">
                  {findCoverTemplate(coverTemplateId).label}
                </strong>{" "}
                · thème{" "}
                <strong className="font-medium text-foreground">{findTheme(themeId).label}</strong>
              </span>
              <button
                type="button"
                onClick={() => setStep("style")}
                className="underline underline-offset-4 hover:text-foreground"
              >
                Modifier
              </button>
            </p>

            <section className="rounded-3xl border border-border bg-card p-6 md:p-8">
              <div className="flex flex-wrap items-baseline justify-between gap-4">
                <h2 className="font-serif text-2xl text-foreground">Découpage</h2>
                <p className="text-sm text-muted-foreground">
                  {filtered.length} photo{filtered.length > 1 ? "s" : ""} ·{" "}
                  {formatBytes(totalBytes)} · {exifCount} date{exifCount > 1 ? "s" : ""} EXIF
                </p>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {MODES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setMode(option.value)}
                    className={
                      "rounded-2xl border p-4 text-left transition-colors " +
                      (mode === option.value
                        ? "border-accent bg-accent/10"
                        : "border-border hover:bg-muted")
                    }
                  >
                    <span className="block text-sm font-medium text-foreground">
                      {option.label}
                    </span>
                    <span className="mt-1 block text-xs leading-snug text-muted-foreground">
                      {option.hint}
                    </span>
                  </button>
                ))}
              </div>

              {mode === "trip" ? (
                <div className="mt-6">
                  <label
                    htmlFor="gap"
                    className="flex flex-wrap items-center justify-between gap-2 text-sm text-foreground"
                  >
                    <span>Nouvel album après</span>
                    <span className="font-medium text-accent">
                      {gapDays} jour{gapDays > 1 ? "s" : ""} sans photo
                    </span>
                  </label>
                  <input
                    id="gap"
                    type="range"
                    min={0}
                    max={14}
                    value={gapDays}
                    onChange={(event) => setGapDays(Number(event.target.value))}
                    className="mt-3 w-full"
                  />
                </div>
              ) : null}

              {mode === "single" ? (
                <div className="mt-6">
                  <label htmlFor="single-title" className="text-sm text-foreground">
                    Titre de l’album
                  </label>
                  <input
                    id="single-title"
                    type="text"
                    value={singleTitle}
                    placeholder="Laissez vide pour utiliser les dates"
                    onChange={(event) => setSingleTitle(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              ) : null}

              <div className="mt-8 border-t border-border pt-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-medium text-foreground">Ne garder que la période</h3>
                  <button
                    type="button"
                    onClick={resetDateFilter}
                    className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                  >
                    Tout reprendre
                  </button>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="text-xs text-muted-foreground">
                    Du
                    <input
                      type="date"
                      value={from}
                      onChange={(event) => setFrom(event.target.value)}
                      className="mt-1 w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Au
                    <input
                      type="date"
                      value={to}
                      onChange={(event) => setTo(event.target.value)}
                      className="mt-1 w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                    />
                  </label>
                </div>
              </div>
            </section>

            <section>
              <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="font-serif text-2xl text-foreground">
                  {groups.length} album{groups.length > 1 ? "s" : ""} proposé
                  {groups.length > 1 ? "s" : ""}
                </h2>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
                >
                  Changer de sélection
                </button>
              </div>

              {groups.length === 0 ? (
                <p className="rounded-3xl border border-dashed border-border px-6 py-16 text-center text-sm text-muted-foreground">
                  Aucune photo dans cette période.
                </p>
              ) : (
                <div className="space-y-4">
                  {groups.map((group) => (
                    <GroupCard
                      key={group.id}
                      group={group}
                      title={titles[group.id] ?? group.title}
                      included={!excluded.has(group.id)}
                      onToggle={() => toggleGroup(group.id)}
                      onRename={(value) =>
                        setTitles((current) => ({ ...current, [group.id]: value }))
                      }
                    />
                  ))}
                </div>
              )}
            </section>

            <div className="above-mobile-nav sticky z-10 flex flex-col items-stretch gap-3 rounded-3xl border border-border bg-card/95 px-5 py-4 text-center shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:rounded-full sm:px-6 sm:text-left">
              <p className="text-sm text-foreground">
                <span className="font-medium">{kept.length}</span> album
                {kept.length > 1 ? "s" : ""} · <span className="font-medium">{keptPhotoCount}</span>{" "}
                photo{keptPhotoCount > 1 ? "s" : ""}
              </p>
              <button
                type="button"
                disabled={kept.length === 0}
                onClick={startImport}
                className="inline-flex w-full items-center justify-center rounded-full bg-primary px-6 py-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 sm:w-auto"
              >
                Créer les albums
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SelectStep({ onPick }: { onPick: () => void }) {
  return (
    <div className="rounded-3xl border border-dashed border-border bg-card px-6 py-16 text-center md:py-24">
      <p className="mx-auto mb-8 max-w-[46ch] text-sm leading-relaxed text-muted-foreground">
        Sur votre téléphone, la galerie s’ouvre directement : vous pouvez y parcourir vos albums
        habituels et sélectionner tout ce que vous voulez d’un seul geste.
      </p>
      <button
        type="button"
        onClick={onPick}
        className="inline-flex items-center justify-center rounded-full bg-primary px-8 py-4 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Choisir mes photos
      </button>
      <p className="mt-6 text-xs text-muted-foreground">
        Les photos sont réduites sur votre appareil avant l’envoi, pour économiser votre forfait.
      </p>
    </div>
  );
}

function ProgressPanel({ title, detail, value }: { title: string; detail: string; value: number }) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);

  return (
    <div className="rounded-3xl border border-border bg-card px-6 py-16 text-center">
      <h2 className="font-serif text-2xl text-foreground">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
      <div className="mx-auto mt-8 h-1.5 w-full max-w-md overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300"
          style={{ width: percent + "%" }}
        />
      </div>
    </div>
  );
}

function DoneStep({
  albums,
  photos,
  failures,
  onSeeAlbums,
  onImportMore,
}: {
  albums: number;
  photos: number;
  failures: number;
  onSeeAlbums: () => void;
  onImportMore: () => void;
}) {
  return (
    <div className="rounded-3xl border border-border bg-card px-6 py-16 text-center">
      <h2 className="font-serif text-3xl text-foreground">Import terminé</h2>
      <p className="mt-3 text-sm text-muted-foreground">
        {albums} album{albums > 1 ? "s" : ""} créé{albums > 1 ? "s" : ""} · {photos} photo
        {photos > 1 ? "s" : ""} envoyée{photos > 1 ? "s" : ""}
        {failures > 0 ? " · " + failures + " échec" + (failures > 1 ? "s" : "") : ""}
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={onSeeAlbums}
          className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Voir mes albums
        </button>
        <button
          type="button"
          onClick={onImportMore}
          className="inline-flex items-center justify-center rounded-full border border-input bg-background px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          Importer d’autres photos
        </button>
      </div>
    </div>
  );
}

function GroupCard({
  group,
  title,
  included,
  onToggle,
  onRename,
}: {
  group: PhotoGroup;
  title: string;
  included: boolean;
  onToggle: () => void;
  onRename: (value: string) => void;
}) {
  const [thumbnails, setThumbnails] = useState<string[]>([]);

  // On ne génère des vignettes que pour les premières photos : en produire une
  // par cliché ferait exploser la mémoire d'un navigateur mobile.
  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];

    void (async () => {
      for (const photo of group.photos.slice(0, PREVIEW_COUNT)) {
        const url = await createThumbnail(photo.file);
        if (!url) continue;
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        urls.push(url);
        setThumbnails([...urls]);
      }
    })();

    return () => {
      cancelled = true;
      setThumbnails([]);
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [group.id, group.photos]);

  return (
    <article
      className={
        "rounded-3xl border p-4 transition-opacity md:p-5 " +
        (included ? "border-border bg-card" : "border-dashed border-border bg-card/40 opacity-60")
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-[16rem] flex-1">
          <input
            type="text"
            value={title}
            onChange={(event) => onRename(event.target.value)}
            aria-label="Titre de l’album"
            className="w-full rounded-xl border border-transparent bg-transparent px-2 py-1 font-serif text-xl text-foreground outline-none transition-colors hover:border-border focus:border-input focus:bg-background"
          />
          <p className="mt-1 px-2 text-sm text-muted-foreground">
            {group.photos.length} photo{group.photos.length > 1 ? "s" : ""}
          </p>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={included} onChange={onToggle} className="size-4" />
          Importer
        </label>
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {thumbnails.map((url) => (
          <img
            key={url}
            src={url}
            alt=""
            loading="lazy"
            className="size-20 shrink-0 rounded-xl object-cover ring-1 ring-black/5 md:size-24"
          />
        ))}
        {group.photos.length > PREVIEW_COUNT ? (
          <div className="flex size-20 shrink-0 items-center justify-center rounded-xl bg-muted text-xs font-medium text-muted-foreground md:size-24">
            +{group.photos.length - PREVIEW_COUNT}
          </div>
        ) : null}
      </div>
    </article>
  );
}
