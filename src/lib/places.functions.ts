/**
 * Retrouver les lieux d'un album, côté serveur.
 *
 * Le géocodage inverse se fait ici et non dans le navigateur : la politique
 * d'usage de Nominatim impose une requête par seconde et un en-tête d'identité
 * — vingt onglets ouverts feraient vingt fois la cadence, et le service nous
 * fermerait la porte. Le serveur sérialise, identifie l'application, et garde
 * chaque réponse dans `geo_cache`.
 *
 * Ne sortent du site que des coordonnées **arrondies** (≈ 110 m), jamais une
 * photo, jamais un identifiant de compte.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { formatPlace, geoKey, type NominatimAddress } from "./places";

const NOMINATIM = "https://nominatim.openstreetmap.org/reverse";
/** Identité demandée par la politique d'usage : l'application, pas l'auteur. */
const USER_AGENT = "PhotoZo/1.0 (albums photo ; +https://visual-scrapbook.vercel.app)";
/** Une requête par seconde, la marge en plus. */
const DELAY_MS = 1100;
/** Au-delà, la fonction serveur durerait trop longtemps : on rappelle. */
const MAX_LOOKUPS = 12;

interface PhotoRow {
  id: string;
  latitude: number | null;
  longitude: number | null;
}

async function lookup(latitude: number, longitude: number) {
  const url =
    NOMINATIM +
    "?format=jsonv2&addressdetails=1&zoom=14&accept-language=fr&lat=" +
    latitude +
    "&lon=" +
    longitude;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { address?: NominatimAddress };
    const label = formatPlace(body.address);
    return label ? { label, country: body.address?.country ?? null } : null;
  } catch {
    // Service indisponible, coupure réseau : la photo garde ses coordonnées et
    // on réessaiera. Un album ne doit pas dépendre d'un serveur tiers.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Nomme les photos de l'album qui ont une position mais pas encore de lieu.
 *
 * Renvoie ce qui a été nommé et ce qui reste : l'appelant rappelle tant qu'il
 * reste des lieux, ce qui borne la durée de chaque requête.
 */
export const fillAlbumPlaces = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ albumId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }): Promise<{ named: number; remaining: number }> => {
    const { data: rows, error } = await context.supabase
      .from("photos")
      .select("id, latitude, longitude")
      .eq("album_id", data.albumId)
      .eq("user_id", context.userId)
      .is("place", null)
      .not("latitude", "is", null)
      .limit(1000);

    if (error) throw error;
    const photos = (rows ?? []) as PhotoRow[];
    if (photos.length === 0) return { named: 0, remaining: 0 };

    // Une question par lieu, pas par photo.
    const groups = new Map<string, { latitude: number; longitude: number; ids: string[] }>();
    for (const photo of photos) {
      if (photo.latitude === null || photo.longitude === null) continue;
      const key = geoKey(photo.latitude, photo.longitude);
      const group = groups.get(key);
      if (group) group.ids.push(photo.id);
      else
        groups.set(key, { latitude: photo.latitude, longitude: photo.longitude, ids: [photo.id] });
    }

    const keys = [...groups.keys()];
    const { data: cached } = await context.supabase
      .from("geo_cache")
      .select("key, label")
      .in("key", keys);

    const labels = new Map<string, string>();
    for (const row of cached ?? []) labels.set(row.key, row.label);

    let lookups = 0;
    for (const [key, group] of groups) {
      if (labels.has(key)) continue;
      if (lookups >= MAX_LOOKUPS) break;
      if (lookups > 0) await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
      lookups += 1;

      const found = await lookup(group.latitude, group.longitude);
      if (!found) continue;
      labels.set(key, found.label);
      await context.supabase
        .from("geo_cache")
        .upsert({ key, label: found.label, country: found.country }, { onConflict: "key" });
    }

    let named = 0;
    for (const [key, group] of groups) {
      const label = labels.get(key);
      if (!label) continue;
      const { error: updateError } = await context.supabase
        .from("photos")
        .update({ place: label })
        .in("id", group.ids)
        .eq("user_id", context.userId);
      if (!updateError) named += group.ids.length;
    }

    const remaining = [...groups.entries()]
      .filter(([key]) => !labels.has(key))
      .reduce((total, [, group]) => total + group.ids.length, 0);

    return { named, remaining };
  });
