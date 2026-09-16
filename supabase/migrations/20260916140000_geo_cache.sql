-- Cache des lieux : coordonnées arrondies → nom lisible.
--
-- Les photos portent des coordonnées EXIF ; le nom du lieu vient d'un service
-- de géocodage inverse (OpenStreetMap / Nominatim), dont la politique d'usage
-- impose une requête par seconde et interdit les campagnes massives. Un album
-- de deux cents photos prises dans la même cour ne doit donc poser qu'une
-- question : on arrondit les coordonnées à trois décimales (≈ 110 m) et on
-- garde la réponse ici, pour tout le monde.
--
-- La table ne contient aucune donnée personnelle : une coordonnée arrondie et
-- le nom public d'un lieu. Elle est donc lisible par tous les comptes
-- connectés — c'est ce qui en fait un cache.
create table if not exists public.geo_cache (
  key text primary key,
  label text not null,
  country text null,
  created_at timestamptz not null default now()
);

alter table public.geo_cache enable row level security;

create policy "Tout compte connecté lit le cache des lieux" on public.geo_cache
  for select to authenticated using (true);

create policy "Tout compte connecté complète le cache des lieux" on public.geo_cache
  for insert to authenticated with check (true);

comment on table public.geo_cache is
  'Géocodage inverse mis en cache : clé = "lat,lon" arrondis à 3 décimales.';
