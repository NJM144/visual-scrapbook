import { supabase } from "@/integrations/supabase/client";
import { createStorageThumbnail, processForUpload } from "@/lib/image-processing";
import { thumbPath } from "@/lib/photo-paths";

/**
 * Envoi d'une photo : l'image compressée, puis sa miniature.
 *
 * La miniature sert partout où la photo s'affiche petite — grille d'album,
 * composition des pages, listes. Sans elle, un album de cent photos fait
 * télécharger quarante mégaoctets à un téléphone pour afficher des vignettes.
 */
export async function uploadPhotoFile(
  file: File,
  userId: string,
  albumId: string,
): Promise<{ path: string }> {
  const processed = await processForUpload(file);
  const path = userId + "/" + albumId + "/" + crypto.randomUUID() + "." + processed.extension;

  const { error } = await supabase.storage
    .from("photos")
    .upload(path, processed.blob, { contentType: processed.blob.type || "image/jpeg" });
  if (error) throw error;

  // Réduite depuis l'image déjà compressée : décoder l'original une seconde
  // fois coûterait cher en mémoire sur un vieux téléphone.
  await uploadThumbnail(path, processed.blob);
  return { path };
}

/**
 * Crée et envoie la miniature d'une photo déjà stockée.
 *
 * Son échec n'est jamais bloquant : les écrans retombent sur l'original.
 */
export async function uploadThumbnail(storagePath: string, source: Blob): Promise<boolean> {
  try {
    const thumbnail = await createStorageThumbnail(source);
    if (!thumbnail) return false;

    const { error } = await supabase.storage
      .from("photos")
      .upload(thumbPath(storagePath), thumbnail, { contentType: "image/jpeg" });
    return !error;
  } catch {
    return false;
  }
}
