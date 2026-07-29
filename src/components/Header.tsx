import { CompassIcon } from "./icons";

export default function Header({
  nodeCount,
  matchCount,
  hasQuery,
}: {
  nodeCount: number;
  matchCount: number;
  hasQuery: boolean;
}) {
  return (
    <header className="rise-in border-b border-stone/70 bg-panel/80 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-teal/50 text-teal">
            <CompassIcon className="h-5 w-5" />
          </span>
          <div>
            <h1 className="font-display text-[22px] font-semibold tracking-tight text-parchment">
              SIFT
            </h1>
            <p className="font-sans text-[11px] uppercase tracking-[0.16em] text-sediment">
              JSON field &amp; value prospecting
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 font-mono text-[11px] text-sediment">
          <div className="flex items-center gap-1.5 rounded-full border border-stone px-3 py-1.5">
            <span className="text-sediment-dim">nodes</span>
            <span className="text-parchment">{nodeCount.toLocaleString()}</span>
          </div>
          <div
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition-colors ${
              hasQuery ? "border-gold/50 text-gold" : "border-stone text-sediment"
            }`}
          >
            <span className={hasQuery ? "text-gold/70" : "text-sediment-dim"}>yield</span>
            <span>{hasQuery ? matchCount.toLocaleString() : "—"}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
