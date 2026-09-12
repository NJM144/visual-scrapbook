/**
 * Les trois versions d'une photo, partagées par le serveur et le navigateur.
 *
 * - vignette : 400 px, WebP q 70 (≈ 18 Ko mesuré) — grilles, bac, onglet Pages ;
 * - affichage : 1 400 px, WebP q 65 (≈ 223 Ko) — plein écran, éditeur, Feuilleter ;
 * - impression : l'original intact, jamais chargé dans l'interface client.
 *
 * Les deux premières sont servies par les transformations d'images Supabase.
 * Leurs URL signées sont enregistrées sur la photo (thumb_url, display_url) :
 * l'adresse ne change plus d'une visite à l'autre, donc le navigateur et le
 * Service Worker peuvent les garder en cache.
 */
export const THUMB_TRANSFORM = { width: 400, height: 400, resize: "contain", quality: 70 } as const;
export const DISPLAY_TRANSFORM = {
  width: 1400,
  height: 1400,
  resize: "contain",
  quality: 65,
} as const;

/** 30 jours, renouvelées quand il leur reste moins d'une semaine. */
export const VERSION_TTL_S = 30 * 24 * 60 * 60;
export const RENEW_BEFORE_MS = 7 * 24 * 60 * 60 * 1000;
