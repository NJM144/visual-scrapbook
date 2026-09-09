-- Le bucket « photos » n'existait que dans le tableau de bord Supabase, créé à
-- la main. Un déploiement du dépôt sur un projet neuf partait donc sans espace
-- de stockage, et chaque envoi de photo échouait — alors que les politiques
-- d'accès sur storage.objects, elles, étaient bien versionnées.
--
-- Il reste privé : les photos sont servies par URL signée, jamais en accès
-- public (voir getPhotos dans src/lib/albums.functions.ts).
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;
