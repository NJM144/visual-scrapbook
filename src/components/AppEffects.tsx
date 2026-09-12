import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { resumeUploads, setUploadHooks } from "@/lib/upload-queue";

/**
 * Effets globaux de l'application, sans rendu :
 * - le Service Worker, qui garde vignettes et versions d'affichage en cache
 *   d'une visite à l'autre ;
 * - la reprise des envois interrompus, dès que l'utilisateur est connu ;
 * - le rafraîchissement des albums quand la file d'envoi avance.
 */
export function AppEffects({ userId }: { userId: string | null }) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (import.meta.env.DEV || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  useEffect(() => {
    // Regroupé : pendant un import, la file signale une avancée toutes les
    // demi-secondes ; recharger l'album à chaque fois serait du gaspillage.
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const refresh = (albumId: string) => {
      if (timers.has(albumId)) return;
      timers.set(
        albumId,
        setTimeout(() => {
          timers.delete(albumId);
          void queryClient.invalidateQueries({ queryKey: ["photos-page", albumId] });
          void queryClient.invalidateQueries({ queryKey: ["photos-export", albumId] });
          void queryClient.invalidateQueries({ queryKey: ["albums"] });
        }, 1500),
      );
    };
    setUploadHooks({ onRowsCreated: refresh, onUploaded: refresh });
    return () => {
      setUploadHooks({});
      for (const timer of timers.values()) clearTimeout(timer);
    };
  }, [queryClient]);

  useEffect(() => {
    if (userId) void resumeUploads(userId);
  }, [userId]);

  return null;
}
