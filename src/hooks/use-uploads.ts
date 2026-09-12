import { useSyncExternalStore } from "react";
import { getServerUploadSnapshot, getUploadSnapshot, subscribeUploads } from "@/lib/upload-queue";

/** État de la file d'envoi, partagé par toutes les pages. */
export function useUploadSnapshot() {
  return useSyncExternalStore(subscribeUploads, getUploadSnapshot, getServerUploadSnapshot);
}
