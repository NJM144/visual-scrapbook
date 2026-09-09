import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { useAuth } from "@/hooks/use-auth";
import { CREDITS } from "@/lib/gallery";

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
      { name: "viewport", content: "width=device-width, initial-scale=1" },
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

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">
          <Outlet />
        </main>
        <Footer />
      </div>
      <Toaster
        position="bottom-center"
        toastOptions={{
          className: "bg-background text-foreground border border-border shadow-lg",
        }}
      />
    </QueryClientProvider>
  );
}

function Header() {
  const { user, loading } = useAuth();

  return (
    <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="font-serif text-2xl tracking-tight text-foreground">
          Anthologie
        </Link>
        <div className="flex items-center gap-8">
          <Link
            to="/"
            className="text-sm font-medium text-foreground/70 hover:text-foreground transition-colors"
          >
            Accueil
          </Link>
          <Link
            to="/albums"
            className="text-sm font-medium text-foreground/70 hover:text-foreground transition-colors"
          >
            Albums
          </Link>
          {loading ? null : user ? (
            <Link
              to="/albums/import"
              className="rounded-full bg-terre px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-terre/90"
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
    <footer className="py-16 border-t border-border">
      <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between gap-12">
        <div className="max-w-[40ch]">
          <span className="font-serif text-xl mb-4 block text-foreground">Anthologie</span>
          <p className="text-sm text-muted-foreground">
            Conçu pour l’observateur patient. Construisez votre héritage numérique une image à la
            fois.
          </p>
        </div>
        <div className="flex gap-16">
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
 * Mention des auteurs des paysages du site. Les licences CC BY-SA l'exigent :
 * si vous remplacez les images, mettez cette liste à jour en conséquence.
 */
function PhotoCredits() {
  return (
    <div className="mx-auto mt-12 max-w-6xl border-t border-border px-6 pt-6">
      <p className="text-xs leading-relaxed text-muted-foreground/70">
        Paysages :{" "}
        {CREDITS.map((image, index) => (
          <span key={image.src}>
            {index > 0 ? " · " : ""}
            <a
              href={image.source}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 transition-colors hover:text-foreground"
            >
              {image.place}
            </a>{" "}
            — {image.author} ({image.license})
          </span>
        ))}
        . Via Wikimedia Commons.
      </p>
    </div>
  );
}
