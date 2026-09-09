-- Cadrage manuel des photos dans le livre.
--
-- Jusqu'ici chaque photo était recadrée automatiquement pour remplir son
-- emplacement : la composition était propre, mais l'auteur n'avait aucun moyen
-- de dire ce qu'il fallait garder. Un visage en bord de cadre disparaissait.

alter table public.photos
  -- Point de la photo maintenu au centre de l'emplacement, en fraction de
  -- l'image (0 = bord gauche/haut, 1 = bord droit/bas).
  add column crop_x real not null default 0.5,
  add column crop_y real not null default 0.5,
  -- 1 = l'image couvre tout juste l'emplacement ; au-delà, on zoome dedans.
  add column crop_zoom real not null default 1,
  -- 'cover' remplit l'emplacement quitte à rogner ; 'contain' montre la photo
  -- entière, avec des marges de la couleur du papier.
  add column fit text not null default 'cover',
  -- Rapport largeur/hauteur de l'image, mesuré à l'import. Sert à composer les
  -- pages selon l'orientation réelle plutôt qu'au hasard, et à estimer la
  -- perte au rognage sans avoir à recharger chaque fichier.
  add column aspect_ratio real;

alter table public.photos
  add constraint photos_crop_x_range check (crop_x >= 0 and crop_x <= 1),
  add constraint photos_crop_y_range check (crop_y >= 0 and crop_y <= 1),
  add constraint photos_crop_zoom_range check (crop_zoom >= 1 and crop_zoom <= 4),
  add constraint photos_fit_values check (fit in ('cover', 'contain')),
  add constraint photos_aspect_ratio_positive check (aspect_ratio is null or aspect_ratio > 0);

comment on column public.photos.crop_x is
  'Point focal horizontal, 0 à 1. Centre par défaut.';
comment on column public.photos.crop_zoom is
  'Facteur de zoom au-delà du cadrage couvrant. 1 = pas de zoom.';
comment on column public.photos.fit is
  'cover = remplir en rognant ; contain = photo entière avec marges.';
comment on column public.photos.aspect_ratio is
  'Largeur / hauteur de l''image d''origine.';
