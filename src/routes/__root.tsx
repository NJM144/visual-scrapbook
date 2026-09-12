import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { House, ImagePlus, Images, ShieldCheck } from "lucide-react";
import { AppEffects } from "@/components/AppEffects";
import { UploadIndicator } from "@/components/UploadIndicator";
import { useEffect, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { useAuth } from "@/hooks/use-auth";
import { CREDITS } from "@/lib/gallery";
import { getIsAdmin } from "@/lib/albums.functions";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page introuvable</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          La page que vous recherchez n’existe pas ou a été déplacée.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Retour à l’accueil
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Cette page n’a pas pu charger
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Une erreur est survenue de notre côté. Vous pouvez réessayer ou revenir à l’accueil.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Réessayer
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-full border border-input bg-background px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Accueil
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      // viewport-fit=cover : l'appli occupe tout l'écran, encoche comprise ; les
      // marges de sécurité sont gérées en CSS (env(safe-area-inset-*)).
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#FBF6EE" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Anthologie" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { title: "Anthologie — Vos albums photos" },
      {
        name: "description",
        content: "Créez et partagez vos albums photos dans un espace calme et élégant.",
      },
      { name: "author", content: "Anthologie" },
      { property: "og:title", content: "Anthologie — Vos albums photos" },
      {
        property: "og:description",
        content: "Créez et partagez vos albums photos dans un espace calme et élégant.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&family=Instrument+Serif&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const { user } = useAuth();

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex min-h-dvh flex-col">
        <Header />
        {/* Un écran de hauteur réservé d'emblée : les pages connectées se
            dessinent côté navigateur, et sans cela le pied de page s'affichait
            en premier avant de se faire chasser (CLS 0,375 → 0,002 mesuré).
            Sur téléphone, la navigation du bas recouvre le pied de page : on
            lui réserve sa hauteur. */}
        <main
          className={
            "min-h-[100svh] flex-1 " +
            (user ? "pb-[calc(var(--mobile-nav-height)+env(safe-area-inset-bottom))] sm:pb-0" : "")
          }
        >
          <Outlet />
        </main>
        <Footer />
      </div>
      <AppEffects userId={user?.id ?? null} />
      {user ? <MobileNav /> : null}
      <Toaster
        position="bottom-center"
        mobileOffset={{ bottom: "calc(5rem + env(safe-area-inset-bottom))" }}
        toastOptions={{
          className: "bg-background text-foreground border border-border shadow-lg",
        }}
      />
    </QueryClientProvider>
  );
}

/**
 * Navigation du bas, sur téléphone : là où tombe le pouce. Les liens de
 * l'en-tête, en haut de l'écran, étaient hors de portée d'une main.
 */
function MobileNav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const fetchIsAdmin = useServerFn(getIsAdmin);
  const { data: isAdmin } = useQuery({
    queryKey: ["is-admin"],
    queryFn: () => fetchIsAdmin(),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const importing = pathname.startsWith("/albums/import");
  const items = [
    { to: "/", label: "Accueil", icon: House, active: pathname === "/" },
    {
      to: "/albums",
      label: "Albums",
      icon: Images,
      active: pathname.startsWith("/albums") && !importing,
    },
    { to: "/albums/import", label: "Importer", icon: ImagePlus, active: importing },
    ...(isAdmin
      ? [{ to: "/admin", label: "Admin", icon: ShieldCheck, active: pathname === "/admin" }]
      : []),
  ] as const;

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden"
    >
      <div className="flex h-[var(--mobile-nav-height)] items-stretch">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={item.active ? "page" : undefined}
              className={
                "flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors " +
                (item.active ? "text-terre" : "text-foreground/60")
              }
            >
              <Icon className="size-6" strokeWidth={item.active ? 2.2 : 1.8} aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function Header() {
  const { user, loading } = useAuth();
  const fetchIsAdmin = useServerFn(getIsAdmin);

  // La requête n'a de sens qu'une fois la session connue : appelée sans
  // session, la fonction serveur répondrait par une erreur d'authentification.
  const { data: isAdmin } = useQuery({
    queryKey: ["is-admin"],
    queryFn: () => fetchIsAdmin(),
    enabled: Boolean(user),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/80 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link
          to="/"
          className="shrink-0 font-serif text-xl tracking-tight text-foreground sm:text-2xl"
        >
          Anthologie
        </Link>
        {/* Barre défilante : sur un téléphone, quatre liens et un bouton ne
            tiennent pas côte à côte sans écraser le logo. */}
        <div className="flex items-center gap-4 overflow-x-auto whitespace-nowrap sm:gap-8">
          <Link
            to="/"
            className="hidden text-sm font-medium text-foreground/70 transition-colors hover:text-foreground sm:inline"
          >
            Accueil
          </Link>
          {/* Connecté, ces liens passent dans la navigation du bas sur téléphone. */}
          <Link
            to="/albums"
            className={
              "text-sm font-medium text-foreground/70 transition-colors hover:text-foreground " +
              (user ? "hidden sm:inline" : "")
            }
          >
            Albums
          </Link>
          {isAdmin ? (
            <Link
              to="/admin"
              className="hidden text-sm font-medium text-foreground/70 transition-colors hover:text-foreground sm:inline"
            >
              Administration
            </Link>
          ) : null}
          {user ? <UploadIndicator /> : null}
          {loading ? null : user ? (
            <Link
              to="/albums/import"
              className="hidden shrink-0 rounded-full bg-terre px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-terre/90 sm:inline-flex"
            >
              Importer
            </Link>
          ) : (
            <Link
              to="/auth"
              className="rounded-full bg-terre px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-terre/90"
            >
              Se connecter
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border py-10 sm:py-16">
      <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between gap-12">
        <div className="max-w-[40ch]">
          <span className="font-serif text-xl mb-4 block text-foreground">Anthologie</span>
          <p className="text-sm text-muted-foreground">
            Conçu pour l’observateur patient. Construisez votre héritage numérique une image à la
            fois.
          </p>
        </div>
        {/* Sur téléphone, ces liens doublonnent l'en-tête et la navigation du bas. */}
        <div className="hidden gap-16 sm:flex">
          <div className="flex flex-col gap-3">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
              Navigation
            </span>
            <Link to="/" className="text-sm text-foreground/70 hover:text-accent transition-colors">
              Accueil
            </Link>
            <Link
              to="/albums"
              className="text-sm text-foreground/70 hover:text-accent transition-colors"
            >
              Albums
            </Link>
          </div>
          <div className="flex flex-col gap-3">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
              Compte
            </span>
            <Link
              to="/auth"
              className="text-sm text-foreground/70 hover:text-accent transition-colors"
            >
              Se connecter
            </Link>
            <Link
              to="/albums/import"
              className="text-sm text-foreground/70 transition-colors hover:text-accent"
            >
              Importer mes photos
            </Link>
          </div>
        </div>
      </div>

      <PhotoCredits />
    </footer>
  );
}

/**
 * Mention des auteurs des photographies du site. Les licences CC BY-SA
 * l'exigent : si vous remplacez les images, mettez cette liste à jour en
 * conséquence.
 */
function PhotoCredits() {
  return (
    <div className="mx-auto mt-12 max-w-6xl border-t border-border px-6 pt-6">
      <p className="text-xs leading-relaxed text-muted-foreground/70">
        Photographies :{" "}
        {CREDITS.map((image, index) => (
          <span key={image.src}>
            {index > 0 ? " · " : ""}
            <a
              href={image.source}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 transition-colors hover:text-foreground"
            >
              {image.event}, {image.place}
            </a>{" "}
            — {image.author} ({image.license})
          </span>
        ))}
        . Via Wikimedia Commons.
      </p>
    </div>
  );
}
