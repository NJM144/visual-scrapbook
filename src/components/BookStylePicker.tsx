import { BOOK_THEMES, findTheme } from "@/lib/book-themes";
import { PRINT_FORMATS, findFormat } from "@/lib/print-formats";
import { COVER_TEMPLATES } from "@/lib/cover-templates";
import { CoverPreview } from "@/components/CoverPreview";
import { WALLPAPERS, findWallpaper, wallpaperScreenUrl } from "@/lib/wallpapers";
import { TEXT_STYLES, findTextStyle, resolveInk } from "@/lib/text-styles";

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
  coverWallpaperId,
  pageWallpaperId,
  onCoverWallpaperChange,
  onPageWallpaperChange,
  textFont,
  inkColor,
  coverInkColor,
  onTextFontChange,
  onInkColorChange,
  onCoverInkColorChange,
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
  /** Papiers peints ; `null` = fond uni du thème. */
  coverWallpaperId: string | null;
  pageWallpaperId: string | null;
  onCoverWallpaperChange: (id: string | null) => void;
  onPageWallpaperChange: (id: string | null) => void;
  /** Écriture et couleurs du texte ; `null` = celles du thème. */
  textFont: string | null;
  inkColor: string | null;
  coverInkColor: string | null;
  onTextFontChange: (id: string | null) => void;
  onInkColorChange: (hex: string | null) => void;
  onCoverInkColorChange: (hex: string | null) => void;
  /** Titre affiché sur les maquettes de couverture. */
  title: string;
  photoUrl?: string | undefined;
  /** Couverture en grand à côté des choix, là où la page n'en montre pas déjà une. */
  withPreview?: boolean;
}) {
  const theme = findTheme(themeId);
  const format = findFormat(formatId);
  const coverWallpaper = findWallpaper(coverWallpaperId);
  const textStyle = findTextStyle(textFont, theme.font);
  const ink = resolveInk(inkColor, theme.ink);
  const coverInk = resolveInk(coverInkColor, theme.coverInk);

  // min-w-0 : posé dans une colonne de grille, ce bloc prendrait sinon la
  // largeur de ses rangées défilantes (sept couvertures côte à côte) et la
  // page entière déborderait de l'écran du téléphone.
  const choices = (
    <div className="min-w-0 space-y-10">
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
                  wallpaper={coverWallpaper}
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
        <h3 className="mb-1 font-serif text-2xl text-foreground">L’écriture</h3>
        <p className="mb-5 text-sm text-muted-foreground">
          Les lettres et leur couleur, pour tout l’album : couverture, titres, légendes et
          paragraphes.
        </p>

        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
          Style de lettres
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {TEXT_STYLES.map((style) => {
            const active = textStyle.id === style.id;
            return (
              <button
                key={style.id}
                type="button"
                onClick={() => onTextFontChange(style.id)}
                className={
                  "rounded-2xl border p-4 text-left transition-colors " +
                  (active ? "border-terre bg-terre/5" : "border-border hover:bg-muted")
                }
              >
                {/* L'exemple est écrit dans la police elle-même : on choisit
                    sur pièce, et c'est le fichier qui partira à l'impression. */}
                <span
                  className="block truncate text-2xl leading-tight text-foreground"
                  style={{ fontFamily: style.css }}
                >
                  {title || "Baptême de Maïa"}
                </span>
                <span className="mt-2 block text-sm font-medium text-foreground">
                  {style.label}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{style.hint}</span>
              </button>
            );
          })}
        </div>
        {textFont ? (
          <button
            type="button"
            onClick={() => onTextFontChange(null)}
            className="mt-3 h-10 rounded-full border border-input px-4 text-xs text-foreground transition-colors hover:bg-muted"
          >
            Revenir à l’écriture du thème
          </button>
        ) : null}

        <InkPicker
          label="Couleur du texte, dans les pages"
          hint="Sur le papier du livre."
          value={ink}
          onChange={onInkColorChange}
          themeValue={theme.ink}
          chosen={inkColor}
          background={theme.paper}
          style={textStyle.css}
        />
        <InkPicker
          label="Couleur du texte, sur la couverture"
          hint="La couverture est souvent sombre ou couverte par une photo : elle a sa propre couleur."
          value={coverInk}
          onChange={onCoverInkColorChange}
          themeValue={theme.coverInk}
          chosen={coverInkColor}
          background={theme.coverBackground}
          style={textStyle.css}
        />
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

      <section>
        <h3 className="mb-1 font-serif text-2xl text-foreground">Le papier peint</h3>
        <p className="mb-5 text-sm text-muted-foreground">
          Un fond illustré sous la couverture, un autre sous les pages — ou aucun, et c’est le
          papier uni du thème. Les cadres laissent le centre libre ; les motifs passent derrière les
          photos.
        </p>
        <WallpaperStrip
          label="Couverture"
          selected={coverWallpaperId}
          onChange={onCoverWallpaperChange}
          plain={theme.coverBackground}
        />
        {coverWallpaperId && coverTemplateId === "photo_pleine" ? (
          <p className="-mt-1 mb-4 text-xs leading-relaxed text-muted-foreground">
            Avec la couverture « Photo pleine page », la photo recouvre le papier peint : choisissez
            « Photo encadrée », « Encart », « Icône », « Bandeau » ou « Typographique » pour le
            voir.
          </p>
        ) : null}
        <WallpaperStrip
          label="Pages"
          selected={pageWallpaperId}
          onChange={onPageWallpaperChange}
          plain={theme.paper}
          className="mt-6"
        />
      </section>
    </div>
  );

  if (!withPreview) return choices;

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_18rem]">
      {choices}
      {/* Sur téléphone, la couverture reste un repère, pas un écran entier :
          les choix doivent arriver sans faire défiler. */}
      <aside className="order-first lg:order-none lg:sticky lg:top-24 lg:self-start">
        <div className="mx-auto max-w-[8.5rem] sm:max-w-[14rem] lg:max-w-none">
          <CoverPreview
            theme={theme}
            format={format}
            title={title}
            subtitle=""
            photoUrl={photoUrl}
            templateId={coverTemplateId}
            wallpaper={coverWallpaper}
            textStyle={textStyle}
            ink={coverInk}
          />
        </div>
      </aside>
    </div>
  );
}

/** Une rangée de papiers peints, « Aucun » en tête. Défile de côté partout : trente fonds en grille feraient un mur. */
function WallpaperStrip({
  label,
  selected,
  onChange,
  plain,
  className = "",
}: {
  label: string;
  selected: string | null;
  onChange: (id: string | null) => void;
  /** Couleur du fond uni, pour la tuile « Aucun ». */
  plain: string;
  className?: string;
}) {
  const tile = (active: boolean) =>
    "w-32 shrink-0 snap-start overflow-hidden rounded-2xl border text-left transition-colors " +
    (active ? "border-terre ring-2 ring-terre/40" : "border-border hover:border-foreground/30");

  return (
    <div className={className}>
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
        {label}
      </p>
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        <button type="button" onClick={() => onChange(null)} className={tile(selected === null)}>
          <span className="block h-24 w-full" style={{ backgroundColor: plain }} />
          <span className="block px-3 py-2 text-sm font-medium text-foreground">Aucun</span>
        </button>
        {WALLPAPERS.map((wallpaper) => (
          <button
            key={wallpaper.id}
            type="button"
            onClick={() => onChange(wallpaper.id)}
            title={wallpaper.kind === "cadre" ? "Cadre" : "Motif"}
            className={tile(selected === wallpaper.id)}
          >
            <img
              src={wallpaperScreenUrl(wallpaper)}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-24 w-full object-cover"
            />
            <span className="block truncate px-3 py-2 text-sm font-medium text-foreground">
              {wallpaper.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Palette d'encres : des tons qui tiennent à l'impression, plus le choix libre. */
const INK_PALETTE: { hex: string; label: string }[] = [
  { hex: "#141414", label: "Encre" },
  { hex: "#3A2418", label: "Brun" },
  { hex: "#1E5B3A", label: "Forêt" },
  { hex: "#141B33", label: "Nuit" },
  { hex: "#7A2E22", label: "Brique" },
  { hex: "#B8562F", label: "Terre cuite" },
  { hex: "#C2A377", label: "Ocre" },
  { hex: "#6B7280", label: "Ardoise" },
  { hex: "#FBF6EE", label: "Crème" },
  { hex: "#FFFFFF", label: "Blanc" },
];

function InkPicker({
  label,
  hint,
  value,
  onChange,
  themeValue,
  chosen,
  background,
  style,
}: {
  label: string;
  hint: string;
  /** Couleur effective, thème compris. */
  value: string;
  onChange: (hex: string | null) => void;
  themeValue: string;
  /** Couleur choisie par l'auteur ; `null` = celle du thème. */
  chosen: string | null;
  /** Fond sur lequel l'aperçu écrit : une encre se juge sur son papier. */
  background: string;
  style: string;
}) {
  return (
    <div className="mt-6">
      <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
        {label}
      </p>
      <p className="mb-3 text-xs text-muted-foreground">{hint}</p>

      <p
        className="mb-3 rounded-xl px-4 py-3 text-xl leading-snug ring-1 ring-black/10"
        style={{ backgroundColor: background, color: value, fontFamily: style }}
      >
        Baptême de Maïa — juin 2026
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(null)}
          title={"Encre du thème (" + themeValue + ")"}
          className={
            "h-10 rounded-full border px-3 text-xs transition-colors " +
            (chosen === null ? "border-terre ring-2 ring-terre/40" : "border-input hover:bg-muted")
          }
        >
          Thème
        </button>
        {INK_PALETTE.map((color) => (
          <button
            key={color.hex}
            type="button"
            onClick={() => onChange(color.hex)}
            title={color.label}
            aria-label={color.label}
            className={
              "size-10 rounded-full border transition-transform " +
              (chosen?.toUpperCase() === color.hex
                ? "scale-110 border-terre ring-2 ring-terre/40"
                : "border-black/10 hover:scale-105")
            }
            style={{ backgroundColor: color.hex }}
          />
        ))}
        <label className="flex h-10 cursor-pointer items-center gap-2 rounded-full border border-input px-3 text-xs text-foreground transition-colors hover:bg-muted">
          <input
            type="color"
            value={value}
            onChange={(event) => onChange(event.target.value.toUpperCase())}
            className="size-6 cursor-pointer rounded border-0 bg-transparent p-0"
          />
          Autre couleur
        </label>
      </div>
    </div>
  );
}
