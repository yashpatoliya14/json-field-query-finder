import { CompassIcon } from "./icons";

export default function Header({
  nodeCount,
  matchCount,
  hasQuery,
  processing,
}: {
  nodeCount: number;
  matchCount: number;
  hasQuery: boolean;
  processing: boolean;
}) {
  return (
    <header className="rise-in border-b border-stone/50 bg-panel/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-5 py-3.5 sm:px-8">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <span className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-teal/40 bg-teal/10 text-teal">
            <CompassIcon className="h-5 w-5" />
            {processing && (
              <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-panel bg-teal">
                <span className="absolute inset-0 rounded-full bg-teal animate-ping opacity-75" />
              </span>
            )}
          </span>
          <div>
            <h1 className="font-display text-[20px] font-semibold tracking-tight text-parchment leading-none">
              SIFT
            </h1>
            <p className="font-sans text-[10px] uppercase tracking-[0.18em] text-sediment leading-none mt-0.5">
              JSON field &amp; value explorer
            </p>
          </div>
        </div>

        {/* Status badges */}
        <div className="flex items-center gap-2 font-mono text-[11px]">
          {processing && (
            <div className="flex items-center gap-1.5 rounded-lg border border-teal/30 bg-teal/[0.07] px-3 py-1.5 text-teal">
              <svg className="processing-spin h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                <path d="M13 2L4.5 13.5H11L10 22L20.5 10H14L13 2Z" />
              </svg>
              <span className="text-[11px]">processing</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 rounded-lg border border-stone/80 bg-riverbed px-3 py-1.5 text-sediment">
            <span className="text-sediment-dim">nodes</span>
            <span className="text-parchment font-medium">{nodeCount.toLocaleString()}</span>
          </div>

          <div
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 transition-all duration-300 ${
              hasQuery && matchCount > 0
                ? "border-gold/40 bg-gold/[0.07] text-gold"
                : hasQuery
                ? "border-stone/80 text-sediment"
                : "border-stone/80 bg-riverbed text-sediment"
            }`}
          >
            <span className={hasQuery && matchCount > 0 ? "text-gold/60" : "text-sediment-dim"}>
              matches
            </span>
            <span className={`font-medium ${hasQuery && matchCount > 0 ? "text-gold" : "text-sediment"}`}>
              {hasQuery ? matchCount.toLocaleString() : "—"}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
