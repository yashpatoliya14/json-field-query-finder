import type { LoadProgress } from "../lib/progress";
import { formatBytes, formatEta } from "../lib/progress";

export default function LoadingOverlay({ progress }: { progress: LoadProgress }) {
  const { label, percent, completed, total, etaMs, phase } = progress;
  const showBytes = phase === "reading" || phase === "inserting";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-riverbed/80 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-label={label}
    >
      <div className="mx-4 w-full max-w-sm rounded-xl border border-stone bg-panel p-6 shadow-2xl">
        <div className="flex items-center gap-3">
          <div
            className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-stone border-t-teal"
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="font-sans text-[13px] font-medium text-parchment">{label}</p>
            <p className="mt-0.5 font-mono text-[11px] text-sediment-dim">
              {showBytes && total > 0 ? (
                <>
                  {formatBytes(completed)} / {formatBytes(total)} · {formatEta(etaMs)}
                </>
              ) : (
                <>{percent}% · {formatEta(etaMs)}</>
              )}
            </p>
          </div>
        </div>

        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-stone/60">
          <div
            className="h-full rounded-full bg-teal transition-[width] duration-150 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </div>
  );
}
