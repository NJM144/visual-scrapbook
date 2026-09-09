-- Mise en page modifiable, et métadonnées exploitées des photos.

-- 1. Mise en page persistée --------------------------------------------------
--
-- Jusqu'ici les pages étaient recalculées à chaque affichage : élégant, mais
-- l'auteur ne pouvait ni déplacer une photo d'une page à l'autre, ni ajouter ou
-- supprimer une feuille. La disposition devient donc une donnée.
--
-- NULL = disposition automatique, celle d'aujourd'hui. Dès la première
-- modification manuelle, la colonne est renseignée et fait autorité.
alter table public.albums
  add column layout jsonb;

comment on column public.albums.layout is
  'Disposition manuelle : {"pages":[{"id":"...","slots":["<photo_id>"|null, ...]}]}. '
  'NULL = disposition automatique calculée depuis les photos.';

-- 2. Métadonnées des photos --------------------------------------------------
alter table public.photos
  -- Date de prise de vue lue dans l'EXIF, distincte de la date d'import.
  add column taken_at timestamptz,
  -- Coordonnées GPS de l'EXIF, quand l'appareil les a enregistrées.
  add column latitude double precision,
  add column longitude double precision,
  -- Lieu résolu depuis les coordonnées, ou saisi à la main.
  add column place text,
  -- Personnes identifiées sur la photo. Saisies par l'auteur : l'application
  -- ne fait aucune reconnaissance biométrique, elle compte les visages et
  -- demande les noms.
  add column people text[] not null default '{}',
  -- Ambiance perçue de la photo, proposée par l'IA et modifiable.
  add column mood text,
  -- Nombre de visages détectés, pour savoir quoi demander à l'auteur.
  add column face_count smallint;

alter table public.photos
  add constraint photos_latitude_range
    check (latitude is null or (latitude >= -90 and latitude <= 90)),
  add constraint photos_longitude_range
    check (longitude is null or (longitude >= -180 and longitude <= 180)),
  add constraint photos_face_count_range
    check (face_count is null or (face_count >= 0 and face_count <= 100));

comment on column public.photos.people is
  'Noms saisis par l''auteur. Aucune reconnaissance faciale n''est effectuée.';
comment on column public.photos.mood is
  'Ambiance de la photo, proposée par l''IA puis ajustable.';

-- Retrouver les photos d'un lieu ou d'une période sans balayer la table.
create index photos_taken_at_idx on public.photos (user_id, taken_at);
