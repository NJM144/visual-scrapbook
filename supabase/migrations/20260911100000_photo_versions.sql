-- Versions de chaque photo et métadonnées d'affichage (LOT 2, 11/09/2026).
--
-- Migration additive : aucune colonne existante n'est supprimée ni renommée.
-- `storage_path` reste la référence historique ; `print_path` la double et
-- désigne explicitement le fichier d'impression, jamais chargé dans l'interface.

alter table public.photos
  add column if not exists width integer,
  add column if not exists height integer,
  add column if not exists thumb_path text,
  add column if not exists display_path text,
  add column if not exists print_path text,
  add column if not exists dominant_color text,
  add column if not exists file_hash text,
  add column if not exists file_size bigint,
  add column if not exists mime_type text,
  add column if not exists upload_status text not null default 'done',
  add column if not exists thumb_url text,
  add column if not exists display_url text,
  add column if not exists urls_expire_at timestamptz;

comment on column public.photos.width is 'Largeur du fichier d''impression, en pixels, orientation appliquée.';
comment on column public.photos.height is 'Hauteur du fichier d''impression, en pixels, orientation appliquée.';
comment on column public.photos.thumb_path is 'Vignette stockée. NULL : servie par transformation du fichier d''impression.';
comment on column public.photos.display_path is 'Version d''affichage stockée. NULL : servie par transformation.';
comment on column public.photos.print_path is 'Fichier d''impression (original intact). Jamais chargé dans l''interface client.';
comment on column public.photos.dominant_color is 'Couleur moyenne (#rrggbb), affichée pendant le chargement.';
comment on column public.photos.file_hash is 'SHA-256 du fichier envoyé : détection des doublons.';
comment on column public.photos.upload_status is 'uploading | done | failed. La ligne existe avant la fin de l''envoi.';
comment on column public.photos.thumb_url is 'URL signée de la vignette, gardée jusqu''à urls_expire_at pour que le navigateur la retrouve en cache.';
comment on column public.photos.display_url is 'URL signée de la version d''affichage, même règle que thumb_url.';

create index if not exists photos_album_taken_idx on public.photos (album_id, taken_at);
create index if not exists photos_album_order_idx on public.photos (album_id, order_index, created_at);
create index if not exists photos_album_hash_idx on public.photos (album_id, file_hash) where file_hash is not null;

-- Les photos s'enregistrent désormais directement depuis le navigateur, sans
-- passer par une fonction serveur. Ces règles restrictives s'ajoutent aux
-- règles existantes : une photo ne peut entrer, ni rester, que dans un album
-- du même compte.
create policy "Photos only in own albums" on public.photos
  as restrictive for insert to authenticated
  with check (exists (select 1 from public.albums a where a.id = album_id and a.user_id = auth.uid()));

create policy "Photos stay in own albums" on public.photos
  as restrictive for update to authenticated
  with check (exists (select 1 from public.albums a where a.id = album_id and a.user_id = auth.uid()));

-- Nombre de photos et photo de couverture par album, calculés en base : lire
-- toutes les photos pour les compter butait sur le plafond de 1 000 lignes de
-- PostgREST. SECURITY INVOKER : la RLS s'applique, chacun ne voit que les siennes.
create or replace function public.album_photo_stats()
returns table (album_id uuid, photo_count bigint, cover_photo_id uuid)
language sql
stable
security invoker
set search_path = public
as $$
  select
    p.album_id,
    count(*) as photo_count,
    (array_agg(p.id order by p.order_index, p.created_at)
      filter (where p.upload_status is distinct from 'uploading'))[1] as cover_photo_id
  from public.photos p
  where p.user_id = auth.uid()
  group by p.album_id;
$$;

grant execute on function public.album_photo_stats() to authenticated;
