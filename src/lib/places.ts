/**
 * Des coordonnées EXIF au nom d'un lieu.
 *
 * Une photo ne sait pas où elle a été prise : elle porte deux nombres. Le nom
 * vient d'un géocodage inverse, chez OpenStreetMap (Nominatim), dont la
 * politique d'usage impose une requête par seconde, un en-tête d'identité, et
 * interdit les campagnes massives. D'où deux règles ici :
 *
 * - les coordonnées sont **arrondies à trois décimales** (≈ 110 m) avant toute
 *   question : deux cents photos prises dans la même cour n'en posent qu'une ;
 * - la réponse est gardée dans `geo_cache`, partagée par tous les comptes —
 *   un lieu public n'appartient à personne.
 *
 * Le format des noms est pensé pour une légende de livre, pas pour une adresse
 * postale : « Cocody, Abidjan » plutôt que « 12 rue des Jardins, Cocody,
 * Abidjan, District d'Abidjan, Côte d'Ivoire, 00225 ».
 */

/** Trois décimales : le quartier, jamais la maison. */
export function geoKey(latitude: number, longitude: number): string {
  return latitude.toFixed(3) + "," + longitude.toFixed(3);
}

/** Réponse de Nominatim, réduite à ce qui nous sert. */
export interface NominatimAddress {
  suburb?: string;
  neighbourhood?: string;
  quarter?: string;
  city_district?: string;
  village?: string;
  town?: string;
  city?: string;
  municipality?: string;
  county?: string;
  state?: string;
  country?: string;
}

/**
 * Compose un nom court : le lieu-dit, puis la ville, puis le pays si on n'a
 * que lui. Deux éléments au plus — au-delà, ce n'est plus une légende.
 */
export function formatPlace(address: NominatimAddress | null | undefined): string | null {
  if (!address) return null;

  const quartier =
    address.suburb ?? address.neighbourhood ?? address.quarter ?? address.city_district ?? null;
  const ville =
    address.city ??
    address.town ??
    address.village ??
    address.municipality ??
    address.county ??
    null;
  const region = address.state ?? null;
  const pays = address.country ?? null;

  const parts: string[] = [];
  if (quartier && quartier !== ville) parts.push(quartier);
  if (ville) parts.push(ville);
  // Sans ville — en pleine campagne, en mer —, la région puis le pays.
  if (parts.length === 0 && region) parts.push(region);
  if (parts.length === 0 && pays) parts.push(pays);
  else if (parts.length === 1 && pays && parts[0] !== pays) parts.push(pays);

  const label = parts.slice(0, 2).join(", ");
  return label.length > 0 ? label.slice(0, 120) : null;
}

/** Coordonnées lisibles, pour qui n'a pas de nom de lieu. */
export function formatCoordinates(latitude: number, longitude: number): string {
  const ns = latitude >= 0 ? "N" : "S";
  const eo = longitude >= 0 ? "E" : "O";
  return (
    Math.abs(latitude).toFixed(3).replace(".", ",") +
    "° " +
    ns +
    " — " +
    Math.abs(longitude).toFixed(3).replace(".", ",") +
    "° " +
    eo
  );
}

/** Lien vers la carte, pour vérifier d'un coup d'œil. */
export function mapUrl(latitude: number, longitude: number): string {
  return (
    "https://www.openstreetmap.org/?mlat=" +
    latitude +
    "&mlon=" +
    longitude +
    "#map=15/" +
    latitude +
    "/" +
    longitude
  );
}

/** Date de prise de vue, telle qu'on l'écrit dans un album. */
export function formatTakenAt(value: string | null | undefined, withTime = false): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

/**
 * La légende que proposent la date et le lieu.
 *
 * L'un ou l'autre suffit : une photo sans position garde sa date, une photo
 * sans date garde son lieu.
 */
export function suggestCaption(
  place: string | null | undefined,
  takenAt: string | null | undefined,
): string | null {
  const date = formatTakenAt(takenAt);
  if (place && date) return place + " — " + date;
  return place ?? date ?? null;
}
