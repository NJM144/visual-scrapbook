import { BOOK_THEMES, findTheme } from "@/lib/book-themes";
import { PRINT_FORMATS, findFormat } from "@/lib/print-formats";
import { COVER_TEMPLATES } from "@/lib/cover-templates";
import { CoverPreview } from "@/components/CoverPreview";

/**
 * Coffret et thème : ce que l'on choisit avant tout le reste.
 *
 * Le format décide du découpage des pages, le thème de leurs marges — composer
 * les photos d'abord, c'était les voir se redisposer au premier changement de
 * format. Le même sélecteur ouvre donc la création d'album, l'import et le
 * livre.
 */
export function BookStylePicker({
  formatId,
  coverTemplateId,
  themeId,
  onFormatChange,
  onCoverTemplateChange,
  onThemeChange,
  title,
  photoUrl,
  withPreview = false,
}: {
  formatId: string;
  coverTemplateId: string;
  themeId: string;
  onFormatChange: (id: string) => void;
  onCoverTemplateChange: (id: string) => void;
  onThemeChange: (id: string) => void;
  /** Titre affiché sur les maquettes de couverture. */
  title: string;
  photoUrl?: string | undefined;
  /** Couverture en grand à côté des choix, là où la page n'en montre pas déjà une. */
  withPreview?: boolean;
}) {
  const theme = findTheme(themeId);
  const format = findFormat(formatId);

  const choices = (
    <div className="space-y-10">
      <section>
        <h3 className="mb-1 font-serif text-2xl text-foreground">Le coffret</h3>
        <p className="mb-5 text-sm text-muted-foreground">
          La taille du livre fini, puis la composition de sa couverture.
        </p>

        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
          Format
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {PRINT_FORMATS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => onFormatChange(option.id)}
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

        <p className="mt-8 mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
          Couverture
        </p>
        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:snap-none sm:gap-3 sm:overflow-visible sm:px-0 sm:grid-cols-3 lg:grid-cols-4">
          {COVER_TEMPLATES.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => onCoverTemplateChange(option.id)}
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
                  photoUrl={photoUrl}
                  templateId={option.id}
                  compact
                />
              </span>
              <span className="mt-2 block text-sm font-medium text-foreground">{option.label}</span>
              <span className="mt-0.5 hidden text-xs leading-snug text-muted-foreground sm:block">
                {option.description}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-1 font-serif text-2xl text-foreground">Le thème</h3>
        <p className="mb-5 text-sm text-muted-foreground">
          Papier, encre, typographie et motif. Il habille le coffret choisi : les deux se combinent
          librement.
        </p>
        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:snap-none sm:gap-3 sm:overflow-visible sm:px-0 sm:grid-cols-3 lg:grid-cols-5">
          {BOOK_THEMES.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => onThemeChange(option.id)}
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
                <span className="size-4 rounded-full" style={{ backgroundColor: option.paper }} />
                <span className="size-4 rounded-full" style={{ backgroundColor: option.accent }} />
              </span>
              <span className="block px-3 py-2 text-sm font-medium text-foreground">
                {option.label}
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );

  if (!withPreview) return choices;

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_18rem]">
      {choices}
      <aside className="order-first lg:order-none lg:sticky lg:top-24 lg:self-start">
        <div className="mx-auto max-w-[14rem] lg:max-w-none">
          <CoverPreview
            theme={theme}
            format={format}
            title={title}
            subtitle=""
            photoUrl={photoUrl}
            templateId={coverTemplateId}
          />
        </div>
      </aside>
    </div>
  );
}
