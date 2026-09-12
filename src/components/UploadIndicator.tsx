import { Link } from "@tanstack/react-router";
import { useUploadSnapshot } from "@/hooks/use-uploads";

const CIRCUMFERENCE = 2 * Math.PI * 8;

/**
 * Envoi en cours, visible depuis n'importe quelle page : l'import continue
 * pendant qu'on navigue. Mène à l'album concerné.
 */
export function UploadIndicator() {
  const uploads = useUploadSnapshot();
  if (uploads.total === 0) return null;

  const target =
    uploads.items.find((item) => item.stage === "échec") ??
    uploads.items.find((item) => item.stage !== "terminé" && item.stage !== "doublon") ??
    uploads.items[0];
  if (!target) return null;

  const ratio = uploads.done / Math.max(1, uploads.total);
  const failed = uploads.failed > 0;
  const label = failed
    ? uploads.failed + " échec" + (uploads.failed > 1 ? "s" : "")
    : uploads.active
      ? uploads.done + "/" + uploads.total
      : "Envoyées";

  return (
    <Link
      to="/albums/$albumId"
      params={{ albumId: target.albumId }}
      aria-label={
        failed
          ? uploads.failed + " photo(s) non envoyée(s) : voir l’album"
          : "Envoi des photos : " + uploads.done + " sur " + uploads.total
      }
      className="flex h-9 shrink-0 items-center gap-2 rounded-full border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
    >
      <svg viewBox="0 0 20 20" className="size-4 -rotate-90" aria-hidden>
        <circle
          cx="10"
          cy="10"
          r="8"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.2"
          strokeWidth="3"
        />
        <circle
          cx="10"
          cy="10"
          r="8"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={(1 - ratio) * CIRCUMFERENCE}
          className={failed ? "text-destructive" : "text-terre"}
        />
      </svg>
      <span className="tabular-nums">{label}</span>
    </Link>
  );
}
