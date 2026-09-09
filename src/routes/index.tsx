import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { ACACIA, SERENGETI, SHOWCASE } from "@/lib/gallery";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Anthologie — Vos albums photos" },
      {
        name: "description",
        content:
          "Importez les photos de votre téléphone : elles se rangent toutes seules en albums, voyage par voyage.",
      },
      { property: "og:title", content: "Anthologie — Vos albums photos" },
      {
        property: "og:description",
        content:
          "Importez les photos de votre téléphone : elles se rangent toutes seules en albums, voyage par voyage.",
      },
      { property: "og:image", content: ACACIA.src },
    ],
  }),
  component: HomePage,
});

const STEPS = [
  {
    number: "01",
    title: "Choisissez vos photos",
    body: "Depuis votre téléphone, la galerie s’ouvre directement. Parcourez vos albums habituels et sélectionnez tout ce que vous voulez d’un seul geste.",
  },
  {
    number: "02",
    title: "Elles se rangent seules",
    body: "La date de prise de vue de chaque cliché suffit à reconstituer vos voyages et vos journées. Un album par séjour, sans rien saisir.",
  },
  {
    number: "03",
    title: "Vous gardez la main",
    body: "Renommez, fusionnez, filtrez sur une période. Rien n’est envoyé tant que le découpage ne vous convient pas.",
  },
];

function HomePage() {
  const { user } = useAuth();

  return (
    <div>
      {/* Hero pleine largeur : c'est la photo qui accueille, pas un bloc de texte. */}
      <header className="relative isolate flex min-h-[34rem] items-end overflow-hidden lg:min-h-[42rem]">
        <img
          src={ACACIA.src}
          alt={ACACIA.alt}
          width={1920}
          height={1440}
          fetchPriority="high"
          className="absolute inset-0 -z-10 size-full object-cover"
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/45 to-black/25"
        />

        <div className="mx-auto w-full max-w-6xl px-6 pb-16 pt-32 lg:pb-24">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.22em] text-white/70">
            {ACACIA.place}
          </p>
          <h1 className="max-w-[18ch] text-balance font-serif text-5xl leading-[1.03] text-white md:text-6xl lg:text-7xl">
            Vos souvenirs se rangent tout seuls.
          </h1>
          <p className="mt-6 max-w-[52ch] text-pretty text-lg leading-relaxed text-white/85">
            Importez les photos de votre téléphone. Anthologie lit leur date de prise de vue et
            reconstitue vos voyages, un album à la fois.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              to={user ? "/albums/import" : "/auth"}
              className="inline-flex items-center justify-center rounded-full bg-terre px-7 py-3.5 text-sm font-medium text-white transition-colors hover:bg-terre/90"
            >
              Importer mes photos
            </Link>
            <Link
              to={user ? "/albums" : "/auth"}
              className="inline-flex items-center justify-center rounded-full border border-white/40 bg-white/10 px-7 py-3.5 text-sm font-medium text-white backdrop-blur transition-colors hover:bg-white/20"
            >
              Voir mes albums
            </Link>
          </div>
        </div>
      </header>

      {/* Comment ça marche */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-terre">
            En trois gestes
          </h2>
          <h3 className="mb-14 max-w-[22ch] font-serif text-4xl text-foreground">
            Plus de dossiers à créer un par un.
          </h3>

          <div className="grid gap-10 md:grid-cols-3">
            {STEPS.map((step) => (
              <div key={step.number} className="border-t-2 border-terre/30 pt-6">
                <span className="font-serif text-3xl text-terre">{step.number}</span>
                <h4 className="mt-3 text-lg font-medium text-foreground">{step.title}</h4>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bande panoramique */}
      <section className="relative isolate overflow-hidden">
        <img
          src={SERENGETI.src}
          alt={SERENGETI.alt}
          width={1920}
          height={600}
          loading="lazy"
          className="absolute inset-0 -z-10 size-full object-cover"
        />
        <div aria-hidden className="absolute inset-0 -z-10 bg-ink/55" />
        <div className="mx-auto max-w-3xl px-6 py-24 text-center lg:py-32">
          <p className="text-balance font-serif text-3xl leading-snug text-white md:text-4xl">
            Une photo prise le mardi et une autre le samedi ne racontent pas la même histoire.
            Anthologie s’en souvient pour vous.
          </p>
        </div>
      </section>

      {/* Exemples d'albums */}
      <section className="bg-canvas-subtle px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-terre">
                Collections
              </h2>
              <h3 className="font-serif text-4xl text-foreground">À quoi ça ressemble</h3>
            </div>
            <Link
              to={user ? "/albums" : "/auth"}
              className="text-sm font-medium text-foreground/70 transition-colors hover:text-terre"
            >
              Voir mes albums →
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {SHOWCASE.map((image) => (
              <figure key={image.src} className="group">
                <div className="overflow-hidden rounded-2xl bg-background ring-1 ring-black/5">
                  <img
                    src={image.src}
                    alt={image.alt}
                    width={1280}
                    height={853}
                    loading="lazy"
                    className="aspect-[4/5] w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                </div>
                <figcaption className="mt-4">
                  <span className="block text-base font-medium text-foreground">{image.place}</span>
                  <span className="block text-sm text-muted-foreground">
                    Photographie de {image.author}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Appel final */}
      <section className="px-6 py-28">
        <div className="mx-auto max-w-3xl text-center">
          <h3 className="text-balance font-serif text-4xl text-foreground md:text-5xl">
            Vos photos attendent depuis des mois dans votre téléphone.
          </h3>
          <p className="mx-auto mt-5 max-w-[48ch] leading-relaxed text-muted-foreground">
            Quelques minutes suffisent pour les transformer en albums que vous aurez envie de
            rouvrir.
          </p>
          <Link
            to={user ? "/albums/import" : "/auth"}
            className="mt-10 inline-flex items-center justify-center rounded-full bg-terre px-8 py-4 text-base font-medium text-white transition-colors hover:bg-terre/90"
          >
            {user ? "Importer mes photos" : "Créer mon compte"}
          </Link>
        </div>
      </section>
    </div>
  );
}
