-- Modèle de couverture, indépendant du thème.
--
-- Le thème donne les couleurs et la typographie ; le modèle donne la
-- composition — photo pleine page, encart façon polaroïd, motif répété…
-- Les séparer multiplie les possibilités sans multiplier la configuration.
alter table public.albums
  add column cover_template text not null default 'photo_pleine';

comment on column public.albums.cover_template is
  'Composition de la couverture (voir src/lib/cover-templates.ts).';
