-- Écriture et couleurs du texte, choisies une fois pour tout l'album.
--
-- Additif : les albums existants gardent NULL et suivent donc le thème, comme
-- avant. Voir src/lib/text-styles.ts pour le catalogue des écritures.
alter table public.albums
  add column if not exists text_font text,
  add column if not exists ink_color text,
  add column if not exists cover_ink_color text;

comment on column public.albums.text_font is
  'Écriture du livre (classique, moderne, manuscrite, machine). NULL = celle du thème.';
comment on column public.albums.ink_color is
  'Couleur du texte des pages, en #RRGGBB. NULL = encre du thème.';
comment on column public.albums.cover_ink_color is
  'Couleur du texte de couverture, en #RRGGBB. NULL = encre de couverture du thème.';
