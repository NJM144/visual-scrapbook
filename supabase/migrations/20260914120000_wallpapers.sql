-- Papiers peints : un fond illustré sous la couverture, un autre sous les pages.
--
-- Le thème donne les couleurs, le modèle la composition ; le papier peint
-- habille le tout d'une texture ou d'un cadre — parchemin, wax, kente,
-- naissance… Les deux choix sont indépendants : une couverture en satin peut
-- ouvrir sur des pages en papier froissé. `null` = fond uni du thème, comme
-- avant. Les identifiants renvoient au catalogue src/lib/wallpapers.ts ;
-- un identifiant inconnu y retombe sur le fond uni.
alter table public.albums
  add column cover_wallpaper text null,
  add column page_wallpaper text null;

comment on column public.albums.cover_wallpaper is
  'Papier peint de la couverture (voir src/lib/wallpapers.ts) ; null = fond uni du thème.';
comment on column public.albums.page_wallpaper is
  'Papier peint des pages intérieures (voir src/lib/wallpapers.ts) ; null = papier du thème.';
