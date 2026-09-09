import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AdminAlbumRow, Album, AlbumPreview, PhotoWithSignedUrl } from "./albums";
import { isAlbumLayout } from "./book-layout";

/**
 * `albums.layout` est du JSON libre côté base. On le valide au passage plutôt
 * que de le forcer : une disposition corrompue doit faire retomber l'album sur
 * le découpage automatique, pas casser l'affichage.
 */
function toAlbum(row: Record<string, unknown>): Album {
  const layout = row["layout"];
  return {
    ...(row as unknown as Album),
    layout: isAlbumLayout(layout) ? layout : null,
  };
}

export const getAlbums = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Album[]> => {
    const { data, error } = await context.supabase
      .from("albums")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data ?? []).map(toAlbum);
  });

export const getAlbum = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ albumId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }): Promise<Album> => {
    const { data: album, error } = await context.supabase
      .from("albums")
      .select("*")
      .eq("id", data.albumId)
      .eq("user_id", context.userId)
      .single();

    if (error || !album) throw new Error("Album introuvable");
    return toAlbum(album);
  });

export const createAlbum = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        title: z.string().min(1).max(120),
        description: z.string().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }): Promise<Album> => {
    const { data: album, error } = await context.supabase
      .from("albums")
      .insert({
        user_id: context.userId,
        title: data.title,
        description: data.description ?? null,
      })
      .select()
      .single();

    if (error) throw error;
    return toAlbum(album);
  });

export const getPhotos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ albumId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }): Promise<PhotoWithSignedUrl[]> => {
    const { data: photos, error } = await context.supabase
      .from("photos")
      .select("*")
      .eq("album_id", data.albumId)
      .eq("user_id", context.userId)
      .order("order_index", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) throw error;

    const withUrls = await Promise.all(
      (photos ?? []).map(async (photo) => {
        const { data: signed } = await context.supabase.storage
          .from("photos")
          .createSignedUrl(photo.storage_path, 60 * 60 * 24);

        return {
          ...photo,
          signedUrl: signed?.signedUrl ?? "",
        };
      }),
    );

    return withUrls;
  });

export const createPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        albumId: z.string().uuid(),
        storagePath: z.string().min(1),
        caption: z.string().max(300).optional(),
        orderIndex: z.number().int().min(0).max(100000).optional(),
        takenAt: z.string().datetime().optional(),
        latitude: z.number().min(-90).max(90).optional(),
        longitude: z.number().min(-180).max(180).optional(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }): Promise<PhotoWithSignedUrl> => {
    const { data: album, error: albumError } = await context.supabase
      .from("albums")
      .select("id")
      .eq("id", data.albumId)
      .eq("user_id", context.userId)
      .single();

    if (albumError || !album) throw new Error("Album introuvable");

    const { data: photo, error } = await context.supabase
      .from("photos")
      .insert({
        album_id: data.albumId,
        user_id: context.userId,
        storage_path: data.storagePath,
        url: "",
        caption: data.caption ?? null,
        order_index: data.orderIndex ?? 0,
        taken_at: data.takenAt ?? null,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
      })
      .select()
      .single();

    if (error) throw error;

    const { data: signed } = await context.supabase.storage
      .from("photos")
      .createSignedUrl(photo.storage_path, 60 * 60 * 24);

    return { ...photo, signedUrl: signed?.signedUrl ?? "" };
  });

export const deletePhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        photoId: z.string().uuid(),
        storagePath: z.string().min(1),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const { error: dbError } = await context.supabase
      .from("photos")
      .delete()
      .eq("id", data.photoId)
      .eq("user_id", context.userId);

    if (dbError) throw dbError;

    const { error: storageError } = await context.supabase.storage
      .from("photos")
      .remove([data.storagePath]);

    if (storageError) throw storageError;

    return { success: true };
  });

export const deleteAlbum = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ albumId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    // Storage objects are deleted by cascade trigger? Supabase doesn't cascade
    // storage on album delete, so we clean up photos first.
    const { data: photos, error: photosError } = await context.supabase
      .from("photos")
      .select("storage_path")
      .eq("album_id", data.albumId)
      .eq("user_id", context.userId);

    if (photosError) throw photosError;

    if (photos && photos.length > 0) {
      const { error: storageError } = await context.supabase.storage
        .from("photos")
        .remove(photos.map((p) => p.storage_path));
      if (storageError) throw storageError;
    }

    const { error } = await context.supabase
      .from("albums")
      .delete()
      .eq("id", data.albumId)
      .eq("user_id", context.userId);

    if (error) throw error;
    return { success: true };
  });

/**
 * Bibliothèque : les albums accompagnés de leur nombre de photos et d'une
 * vignette de couverture.
 *
 * `albums.cover_image` n'est pas exploitable ici — le bucket `photos` est privé,
 * une URL brute n'y donne pas accès. On signe donc la première photo de chaque
 * album. Tout est résolu en deux requêtes plutôt qu'une par album.
 */
export const getAlbumsWithPreview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AlbumPreview[]> => {
    const { data: albums, error } = await context.supabase
      .from("albums")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    if (!albums || albums.length === 0) return [];

    const { data: photos, error: photosError } = await context.supabase
      .from("photos")
      .select("album_id, storage_path, order_index, created_at")
      .eq("user_id", context.userId)
      .order("order_index", { ascending: true })
      .order("created_at", { ascending: true });

    if (photosError) throw photosError;

    const counts = new Map<string, number>();
    const covers = new Map<string, string>();
    for (const photo of photos ?? []) {
      counts.set(photo.album_id, (counts.get(photo.album_id) ?? 0) + 1);
      if (!covers.has(photo.album_id)) covers.set(photo.album_id, photo.storage_path);
    }

    const coverPaths = [...covers.values()];
    const signedByPath = new Map<string, string>();

    if (coverPaths.length > 0) {
      const { data: signed } = await context.supabase.storage
        .from("photos")
        .createSignedUrls(coverPaths, 60 * 60 * 24);

      for (const entry of signed ?? []) {
        if (entry.path && entry.signedUrl) signedByPath.set(entry.path, entry.signedUrl);
      }
    }

    return albums.map((album) => {
      const coverPath = covers.get(album.id);
      return {
        ...toAlbum(album),
        photo_count: counts.get(album.id) ?? 0,
        cover_url: coverPath ? (signedByPath.get(coverPath) ?? null) : null,
      };
    });
  });

/* ------------------------------------------------------- livre imprimable */

/** Enregistre les réglages d'impression : thème, format, textes de couverture. */
export const updateAlbumBook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        albumId: z.string().uuid(),
        theme: z.string().min(1).max(40),
        pageFormat: z.string().min(1).max(40),
        coverTitle: z.string().max(120).nullable().optional(),
        coverSubtitle: z.string().max(160).nullable().optional(),
        coverPhotoId: z.string().uuid().nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }): Promise<Album> => {
    const { data: album, error } = await context.supabase
      .from("albums")
      .update({
        theme: data.theme,
        page_format: data.pageFormat,
        cover_title: data.coverTitle ?? null,
        cover_subtitle: data.coverSubtitle ?? null,
        cover_photo_id: data.coverPhotoId ?? null,
      })
      .eq("id", data.albumId)
      .eq("user_id", context.userId)
      .select()
      .single();

    if (error) throw error;
    return toAlbum(album);
  });

/** Le compte courant a-t-il le rôle administrateur ? */
export const getIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<boolean> => {
    const { data, error } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();

    if (error) return false;
    return Boolean(data);
  });

/**
 * Album destiné à l'export, sans filtrer sur le propriétaire.
 *
 * Le filtrage est laissé à la RLS, qui autorise le propriétaire *ou* un
 * administrateur. Refiltrer ici sur user_id empêcherait justement l'admin de
 * préparer les fichiers d'un client.
 */
export const getAlbumForExport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ albumId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }): Promise<Album> => {
    const { data: album, error } = await context.supabase
      .from("albums")
      .select("*")
      .eq("id", data.albumId)
      .single();

    if (error || !album) throw new Error("Album introuvable");
    return toAlbum(album);
  });

/** Photos d'un album pour l'export, avec URL signées. Même règle RLS. */
export const getPhotosForExport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ albumId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }): Promise<PhotoWithSignedUrl[]> => {
    const { data: photos, error } = await context.supabase
      .from("photos")
      .select("*")
      .eq("album_id", data.albumId)
      .order("order_index", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) throw error;
    if (!photos || photos.length === 0) return [];

    // Une seule requête de signature : un livre peut compter cent photos, et
    // les signer une par une multiplierait les allers-retours d'autant.
    const { data: signed } = await context.supabase.storage.from("photos").createSignedUrls(
      photos.map((photo) => photo.storage_path),
      60 * 60 * 6,
    );

    const byPath = new Map<string, string>();
    for (const entry of signed ?? []) {
      if (entry.path && entry.signedUrl) byPath.set(entry.path, entry.signedUrl);
    }

    return photos.map((photo) => ({
      ...photo,
      signedUrl: byPath.get(photo.storage_path) ?? "",
    }));
  });

/** Tous les albums, tous comptes confondus. Réservé à l'administrateur. */
export const getAllAlbumsForAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminAlbumRow[]> => {
    const { data: isAdmin } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();

    if (!isAdmin) throw new Error("Accès réservé aux administrateurs.");

    const { data: albums, error } = await context.supabase
      .from("albums")
      .select("id, user_id, title, created_at, theme, page_format")
      .order("created_at", { ascending: false });

    if (error) throw error;
    if (!albums || albums.length === 0) return [];

    const { data: photos } = await context.supabase.from("photos").select("album_id");

    const counts = new Map<string, number>();
    for (const photo of photos ?? []) {
      counts.set(photo.album_id, (counts.get(photo.album_id) ?? 0) + 1);
    }

    return albums.map((album) => ({ ...album, photo_count: counts.get(album.id) ?? 0 }));
  });

/** Légende d'une photo, imprimée sous l'image dans le livre. */
export const updatePhotoCaption = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        photoId: z.string().uuid(),
        caption: z.string().max(300).nullable(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("photos")
      .update({ caption: data.caption?.trim() || null })
      .eq("id", data.photoId)
      .eq("user_id", context.userId);

    if (error) throw error;
    return { success: true };
  });

/**
 * Réordonne les photos d'un album.
 *
 * On reçoit la liste complète des identifiants dans l'ordre voulu et on
 * réécrit chaque order_index. Envoyer seulement les positions déplacées
 * laisserait des rangs en double dès qu'une photo est insérée entre deux
 * autres.
 */
export const reorderPhotos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        albumId: z.string().uuid(),
        photoIds: z.array(z.string().uuid()).min(1).max(500),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    for (let index = 0; index < data.photoIds.length; index += 1) {
      const photoId = data.photoIds[index];
      if (!photoId) continue;

      const { error } = await context.supabase
        .from("photos")
        .update({ order_index: index })
        .eq("id", photoId)
        .eq("album_id", data.albumId)
        .eq("user_id", context.userId);

      if (error) throw error;
    }
    return { success: true };
  });

/** Cadrage d'une photo : point focal, zoom, mode de remplissage. */
export const updatePhotoFraming = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        photoId: z.string().uuid(),
        cropX: z.number().min(0).max(1),
        cropY: z.number().min(0).max(1),
        cropZoom: z.number().min(1).max(4),
        fit: z.enum(["cover", "contain"]),
        aspectRatio: z.number().positive().max(100).optional(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const base = {
      crop_x: data.cropX,
      crop_y: data.cropY,
      crop_zoom: data.cropZoom,
      fit: data.fit,
    };
    // Mesuré à l'analyse : on ne l'écrase pas quand il n'est pas fourni.
    const patch =
      data.aspectRatio === undefined ? base : { ...base, aspect_ratio: data.aspectRatio };

    const { error } = await context.supabase
      .from("photos")
      .update(patch)
      .eq("id", data.photoId)
      .eq("user_id", context.userId);

    if (error) throw error;
    return { success: true };
  });

/** Enregistre les rapports d'aspect mesurés, pour composer les pages. */
export const saveAspectRatios = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        entries: z
          .array(
            z.object({ photoId: z.string().uuid(), aspectRatio: z.number().positive().max(100) }),
          )
          .min(1)
          .max(500),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    for (const entry of data.entries) {
      const { error } = await context.supabase
        .from("photos")
        .update({ aspect_ratio: entry.aspectRatio })
        .eq("id", entry.photoId)
        .eq("user_id", context.userId);

      if (error) throw error;
    }
    return { success: true };
  });

/** Disposition manuelle des pages. `null` rend la main au découpage automatique. */
export const updateAlbumLayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        albumId: z.string().uuid(),
        layout: z
          .object({
            pages: z
              .array(
                z.object({
                  id: z.string().min(1).max(64),
                  slots: z.array(z.string().uuid().nullable()).min(1).max(4),
                }),
              )
              .max(300),
          })
          .nullable(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("albums")
      .update({ layout: data.layout })
      .eq("id", data.albumId)
      .eq("user_id", context.userId);

    if (error) throw error;
    return { success: true };
  });

/**
 * Informations éditoriales d'une photo : ambiance, lieu, personnes.
 *
 * Les noms sont saisis par l'auteur. L'application ne fait aucune
 * reconnaissance faciale : elle compte les visages et demande qui c'est.
 */
export const updatePhotoMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        photoId: z.string().uuid(),
        mood: z.string().max(200).nullable().optional(),
        place: z.string().max(160).nullable().optional(),
        people: z.array(z.string().min(1).max(80)).max(30).optional(),
        faceCount: z.number().int().min(0).max(100).optional(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const patch: {
      mood?: string | null;
      place?: string | null;
      people?: string[];
      face_count?: number;
    } = {};
    if (data.mood !== undefined) patch.mood = data.mood?.trim() || null;
    if (data.place !== undefined) patch.place = data.place?.trim() || null;
    if (data.people !== undefined) patch.people = data.people.map((name) => name.trim());
    if (data.faceCount !== undefined) patch.face_count = data.faceCount;

    if (Object.keys(patch).length === 0) return { success: true };

    const { error } = await context.supabase
      .from("photos")
      .update(patch)
      .eq("id", data.photoId)
      .eq("user_id", context.userId);

    if (error) throw error;
    return { success: true };
  });
