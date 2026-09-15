/*
 * Service Worker de PhotoZo : cache des vignettes et versions d'affichage.
 *
 * Les photos passent par des URL signées dont le jeton change à chaque
 * signature, et Supabase ne renvoie pas d'en-tête Cache-Control : le
 * navigateur retéléchargeait tout à chaque visite (0 photo servie du cache,
 * mesure du 11/09/2026). On range donc chaque image sous une clé stable — le
 * chemin du fichier et ses transformations, lus dans le jeton — et on la sert
 * depuis ce cache aux visites suivantes. Le bucket reste privé.
 *
 * Seules les versions transformées (vignette, affichage) sont concernées. Le
 * fichier d'impression n'est jamais mis en cache.
 */
const CACHE = "photozo-photos-v1";
const MAX_ENTRIES = 2000;
const RENDER_PATH = "/storage/v1/render/image/sign/photos/";

self.addEventListener("install", () => self.skipWaiting());
// Le cache s'appelait « anthologie-photos-v1 » avant le changement de nom :
// on le supprime à l'activation, sinon il resterait sur le téléphone sans
// jamais être relu.
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  ),
);

function stableKey(requestUrl) {
  const url = new URL(requestUrl);
  const token = url.searchParams.get("token");
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (!payload.url) return null;
    return url.origin + "/photozo-cache/" + payload.url + "?" + (payload.transformations || "");
  } catch {
    return null;
  }
}

let trimming = false;
async function trim(cache) {
  if (trimming) return;
  trimming = true;
  try {
    const keys = await cache.keys();
    for (let i = 0; i < keys.length - MAX_ENTRIES; i += 1) await cache.delete(keys[i]);
  } finally {
    trimming = false;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || !request.url.includes(RENDER_PATH)) return;
  const key = stableKey(request.url);
  if (!key) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(key);
      if (hit) return hit;

      // Requête CORS explicite : une réponse opaque compterait ~7 Mo par image
      // dans le quota de stockage de Chrome.
      const response = await fetch(request.url, { mode: "cors", credentials: "omit" });
      if (response.ok) {
        event.waitUntil(cache.put(key, response.clone()).then(() => trim(cache)));
      }
      return response;
    })(),
  );
});
