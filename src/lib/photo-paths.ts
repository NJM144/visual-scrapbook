/**
 * Chemins de stockage dérivés d'une photo.
 *
 * La miniature vit à côté de l'original, sous le même nom suffixé : aucune
 * colonne en base, et son chemin se déduit de celui de la photo — pour la
 * signer comme pour la supprimer.
 */

export const THUMB_SUFFIX = ".thumb.jpg";

export function thumbPath(storagePath: string): string {
  const slash = storagePath.lastIndexOf("/");
  const dot = storagePath.lastIndexOf(".");
  const base = dot > slash ? storagePath.slice(0, dot) : storagePath;
  return base + THUMB_SUFFIX;
}
