-- Rôles applicatifs, réglages du livre imprimable, et accès administrateur.

-- 1. Rôles ------------------------------------------------------------------

create type public.app_role as enum ('admin', 'user');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

-- Le rôle se lit via une fonction SECURITY DEFINER : une politique RLS sur
-- albums qui irait lire user_roles avec les droits de l'appelant déclencherait
-- la RLS de user_roles à son tour, donc une récursion. La fonction contourne
-- cela en s'exécutant avec les droits de son propriétaire.
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  );
$$;

-- Chacun voit ses propres rôles ; personne ne se les attribue depuis le client.
-- L'octroi du rôle admin passe par le tableau de bord Supabase ou une clé de
-- service : sans quoi n'importe quel compte pourrait se promouvoir.
create policy "Users can read their own roles" on public.user_roles
  for select to authenticated
  using (auth.uid() = user_id);

-- 2. Réglages du livre ------------------------------------------------------

alter table public.albums
  add column theme text not null default 'savane',
  add column page_format text not null default 'carre_20',
  add column cover_title text,
  add column cover_subtitle text,
  add column cover_photo_id uuid references public.photos(id) on delete set null;

comment on column public.albums.theme is
  'Identifiant du thème graphique (voir src/lib/book-themes.ts).';
comment on column public.albums.page_format is
  'Format d''impression (voir src/lib/print-formats.ts) : carre_20, carre_30, a4_portrait…';
comment on column public.albums.cover_title is
  'Titre imprimé sur la couverture ; retombe sur albums.title si vide.';

-- 3. Accès administrateur ---------------------------------------------------

-- L'administrateur prépare les fichiers pour l'imprimerie : il lui faut voir
-- les albums et les photos de tous les comptes, mais en lecture seule — rien
-- ne justifie qu'il modifie ou supprime le travail d'un client.
create policy "Admins can read every album" on public.albums
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create policy "Admins can read every photo" on public.photos
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- Sans cette politique, l'administrateur listerait les photos sans jamais
-- pouvoir en signer les URL : le PDF sortirait avec des pages vides.
create policy "Admins can read every stored photo" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and public.has_role(auth.uid(), 'admin'));
