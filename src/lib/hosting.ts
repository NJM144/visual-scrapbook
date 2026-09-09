/**
 * Détection de l'hébergement Lovable.
 *
 * Le bouton « Continuer avec Google » passe par `lovable.auth.signInWithOAuth`,
 * qui redirige le navigateur vers `/~oauth/initiate`. Cette route est servie par
 * la plateforme Lovable et par elle seule : elle n'existe ni dans le code de
 * l'application, ni dans le serveur de développement Vite. Partout ailleurs —
 * Vercel, Cloudflare, localhost — le clic aboutit à un 404.
 *
 * On masque donc le bouton hors de Lovable, plutôt que d'exposer une impasse.
 * La connexion par e-mail et mot de passe fonctionne, elle, sur tous les hôtes.
 *
 * Pour que Google fonctionne ailleurs, il faudrait passer par le fournisseur
 * OAuth de Supabase (`supabase.auth.signInWithOAuth`) et l'activer dans le
 * projet Supabase — il ne l'est pas aujourd'hui.
 */
const LOVABLE_HOST_SUFFIXES = [".lovable.app", ".lovableproject.com", ".lovable.dev"];

export function supportsLovableOAuth(hostname: string): boolean {
  return LOVABLE_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
}
