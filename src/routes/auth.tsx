import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/use-auth";
import { supportsLovableOAuth } from "@/lib/hosting";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Connexion — Anthologie" },
      {
        name: "description",
        content: "Connectez-vous à Anthologie pour créer et retrouver vos albums photos.",
      },
      { property: "og:title", content: "Connexion — Anthologie" },
      {
        property: "og:description",
        content: "Connectez-vous à Anthologie pour créer et retrouver vos albums photos.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  // Renseigné après montage : window n'existe pas pendant le rendu serveur.
  const [googleAvailable, setGoogleAvailable] = useState(false);
  useEffect(() => {
    setGoogleAvailable(supportsLovableOAuth(window.location.hostname));
  }, []);

  useEffect(() => {
    if (!loading && user) {
      navigate({ to: "/albums" });
    }
  }, [loading, user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/albums` },
        });
        if (error) throw error;
        toast.success("Compte créé. Vérifiez votre boîte mail si une confirmation est requise.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Bienvenue.");
        navigate({ to: "/albums" });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Une erreur est survenue");
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    const { data } = await supabase.auth.getSession();
    if (data.session) navigate({ to: "/albums" });
  };

  return (
    <div className="px-6 py-20">
      <div className="mx-auto w-full max-w-md">
        <h1 className="font-serif text-4xl text-foreground">
          {mode === "signin" ? "Se connecter" : "Créer un compte"}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Un espace calme pour relier vos souvenirs.
        </p>

        <div className="mt-8 flex gap-2 rounded-full bg-muted p-1">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                mode === m ? "bg-background text-foreground shadow-sm" : "text-foreground/60"
              }`}
            >
              {m === "signin" ? "Connexion" : "Inscription"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
              Email
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              placeholder="vous@exemple.com"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
              Mot de passe
            </span>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              placeholder="••••••••"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="mt-2 inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {busy ? "Un instant…" : mode === "signin" ? "Se connecter" : "Créer mon compte"}
          </button>
        </form>

        {googleAvailable ? (
          <>
            <div className="my-8 flex items-center gap-4">
              <span className="h-px flex-1 bg-border" />
              <span className="text-xs uppercase tracking-widest text-muted-foreground/60">ou</span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <button
              type="button"
              onClick={handleGoogle}
              className="inline-flex w-full items-center justify-center rounded-full border border-input bg-background px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Continuer avec Google
            </button>
          </>
        ) : null}

        <p className="mt-8 text-center text-sm text-muted-foreground">
          <Link to="/" className="hover:text-foreground transition-colors">
            Retour à l’accueil
          </Link>
        </p>
      </div>
    </div>
  );
}
