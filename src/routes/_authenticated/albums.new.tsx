import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { createAlbum } from "@/lib/albums.functions";
import { BookStylePicker } from "@/components/BookStylePicker";
import { CoverPreview } from "@/components/CoverPreview";
import { DEFAULT_THEME_ID, findTheme } from "@/lib/book-themes";
import { DEFAULT_FORMAT_ID, findFormat } from "@/lib/print-formats";
import { DEFAULT_COVER_TEMPLATE, findCoverTemplate } from "@/lib/cover-templates";

export const Route = createFileRoute("/_authenticated/albums/new")({
  head: () => ({
    meta: [
      { title: "Nouvel album — Anthologie" },
      {
        name: "description",
        content: "Créez un nouvel album photo et commencez à y relier vos souvenirs.",
      },
      { property: "og:title", content: "Nouvel album — Anthologie" },
      {
        property: "og:description",
        content: "Créez un nouvel album photo et commencez à y relier vos souvenirs.",
      },
    ],
  }),
  component: NewAlbumPage,
});

type Step = "style" | "details";

function NewAlbumPage() {
  const [step, setStep] = useState<Step>("style");
  const [formatId, setFormatId] = useState(DEFAULT_FORMAT_ID);
  const [coverTemplateId, setCoverTemplateId] = useState(DEFAULT_COVER_TEMPLATE);
  const [themeId, setThemeId] = useState(DEFAULT_THEME_ID);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const create = useServerFn(createAlbum);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const album = await create({
        data: {
          title: title.trim(),
          description: description.trim() || undefined,
          theme: themeId,
          pageFormat: formatId,
          coverTemplate: coverTemplateId,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["albums"] });
      toast.success("Album créé.");
      navigate({ to: "/albums/$albumId", params: { albumId: album.id } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Création impossible");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-6 py-16">
      <div className={"mx-auto " + (step === "style" ? "max-w-6xl" : "max-w-xl")}>
        <Link
          to="/albums"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Mes albums
        </Link>
        <p className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-terre">
          Étape {step === "style" ? "1" : "2"} sur 2
        </p>
        <h1 className="mt-2 font-serif text-4xl text-foreground">
          {step === "style" ? "Choisissez le coffret et le thème" : "Nommez votre album"}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {step === "style"
            ? "Ils décident de la mise en page : on les fixe avant d’ajouter les photos. Vous pourrez encore en changer plus tard."
            : "Vous ajouterez vos photos juste après."}
        </p>

        {step === "style" ? (
          <div className="mt-10">
            <BookStylePicker
              formatId={formatId}
              coverTemplateId={coverTemplateId}
              themeId={themeId}
              onFormatChange={setFormatId}
              onCoverTemplateChange={setCoverTemplateId}
              onThemeChange={setThemeId}
              title={title.trim() || "Mon album"}
              withPreview
            />
            <div className="mt-10 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setStep("details");
                  window.scrollTo({ top: 0 });
                }}
                className="w-full rounded-full bg-terre px-6 py-3.5 text-sm font-medium text-white transition-colors hover:bg-terre/90 sm:w-auto"
              >
                Continuer →
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-8 flex items-center gap-4 rounded-2xl border border-border bg-card p-3">
              <div className="w-16 shrink-0">
                <CoverPreview
                  theme={findTheme(themeId)}
                  format={findFormat(formatId)}
                  title={title.trim() || "Mon album"}
                  subtitle=""
                  templateId={coverTemplateId}
                  compact
                />
              </div>
              <p className="min-w-0 flex-1 text-sm text-muted-foreground">
                {findFormat(formatId).label} · {findCoverTemplate(coverTemplateId).label} ·{" "}
                {findTheme(themeId).label}
              </p>
              <button
                type="button"
                onClick={() => setStep("style")}
                className="shrink-0 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                Modifier
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
              <label className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
                  Titre
                </span>
                <input
                  required
                  maxLength={120}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Été en Auvergne"
                  className="rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
                  Description (optionnelle)
                </span>
                <textarea
                  maxLength={500}
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Quelques mots sur cette collection…"
                  className="resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
              <button
                type="submit"
                disabled={busy || title.trim().length === 0}
                className="mt-2 inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {busy ? "Création…" : "Créer l’album"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
