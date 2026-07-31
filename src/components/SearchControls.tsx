import type { SearchMode, SearchOptions } from "../lib/types";
import { CaretIcon, SearchIcon, XIcon } from "./icons";
import { useRef } from "react";

interface SearchControlsProps {
  query: string;
  onQueryChange: (q: string) => void;
  options: SearchOptions;
  onOptionsChange: (o: SearchOptions) => void;
  matchCount: number;
  activeIndex: number;
  onNext: () => void;
  onPrev: () => void;
  error: string | null;
  searching: boolean;
  lastSearchMs: number | null;
}

const MODES: { id: SearchMode; label: string; short: string }[] = [
  { id: "both", label: "Keys + Values", short: "Both" },
  { id: "keys", label: "Keys only", short: "Keys" },
  { id: "values", label: "Values only", short: "Values" },
];

export default function SearchControls({
  query,
  onQueryChange,
  options,
  onOptionsChange,
  matchCount,
  activeIndex,
  onNext,
  onPrev,
  error,
  searching,
  lastSearchMs,
}: SearchControlsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hasQuery = query.trim().length > 0;

  return (
    <div className="search-panel rounded-xl border border-stone/80 bg-panel overflow-hidden">
      {/* ── Search input row ── */}
      <div
        className={`search-input-wrap flex items-center gap-2.5 px-3 py-2.5 transition-all duration-200 ${
          hasQuery ? "border-b border-stone/60" : ""
        }`}
      >
        <div className="relative flex shrink-0">
          <SearchIcon
            className={`h-4 w-4 transition-colors duration-200 ${
              hasQuery ? "text-teal" : "text-sediment"
            }`}
          />
          {searching && (
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-teal animate-ping" />
          )}
        </div>

        <input
          ref={inputRef}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (e.shiftKey) onPrev(); else onNext();
            }
            if (e.key === "Escape" && query) {
              e.preventDefault();
              onQueryChange("");
            }
          }}
          type="text"
          placeholder="Search keys and values…"
          className="w-full bg-transparent font-mono text-[13.5px] text-parchment outline-none placeholder:text-sediment-dim"
          aria-label="Search JSON fields and values"
          spellCheck={false}
          autoComplete="off"
        />

        {/* Match counter badge */}
        <div className="flex shrink-0 items-center gap-1.5">
          {hasQuery && !error && (
            <span
              className={`min-w-[38px] rounded-md px-2 py-0.5 text-center font-mono text-[11px] transition-all duration-200 ${
                matchCount > 0
                  ? "bg-gold/15 text-gold"
                  : "bg-stone-soft text-sediment-dim"
              }`}
            >
              {searching ? "…" : matchCount > 0 ? `${activeIndex + 1}/${matchCount}` : "0"}
            </span>
          )}
          {query && (
            <button
              type="button"
              onClick={() => { onQueryChange(""); inputRef.current?.focus(); }}
              aria-label="Clear search"
              className="text-sediment-dim hover:text-rust transition-colors"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Match nav + timing ── */}
      {hasQuery && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-stone/60">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`font-mono text-[11.5px] transition-colors duration-200 ${
                error
                  ? "text-rust"
                  : matchCount > 0
                  ? "text-parchment/70"
                  : "text-sediment"
              }`}
            >
              {error
                ? "⚠ Invalid regex"
                : matchCount > 0
                ? `${matchCount.toLocaleString()} match${matchCount === 1 ? "" : "es"}`
                : searching
                ? "Searching…"
                : "No matches"}
            </span>

            {/* ⚡ Search duration badge — shown after a search completes */}
            {!searching && lastSearchMs !== null && hasQuery && (
              <span
                title="DuckDB search time"
                className="inline-flex items-center gap-0.5 rounded-md bg-teal/10 border border-teal/25 px-1.5 py-0.5 font-mono text-[10px] text-teal/80 leading-none"
              >
                ⚡{" "}
                {lastSearchMs < 1
                  ? "<1 ms"
                  : lastSearchMs < 1000
                  ? `${Math.round(lastSearchMs)} ms`
                  : `${(lastSearchMs / 1000).toFixed(1)} s`}
              </span>
            )}
          </div>

          {!error && matchCount > 0 && (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={onPrev}
                aria-label="Previous match"
                className="flex items-center justify-center rounded-md border border-stone/80 p-1.5 text-sediment transition-all hover:border-gold/60 hover:text-gold active:scale-95"
              >
                <CaretIcon className="h-3 w-3 -rotate-90" />
              </button>
              <button
                type="button"
                onClick={onNext}
                aria-label="Next match"
                className="flex items-center justify-center rounded-md border border-stone/80 p-1.5 text-sediment transition-all hover:border-gold/60 hover:text-gold active:scale-95"
              >
                <CaretIcon className="h-3 w-3 rotate-90" />
              </button>
              <span className="ml-1 font-mono text-[10px] text-sediment-dim">↵ / ⇧↵</span>
            </div>
          )}
        </div>
      )}

      {/* ── Options ── */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <div className="mode-switcher relative flex items-center overflow-hidden rounded-lg border border-stone/80 bg-riverbed">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onOptionsChange({ ...options, mode: m.id })}
              className={`relative z-10 px-2.5 py-1 font-sans text-[11px] transition-all duration-200 ${
                options.mode === m.id ? "text-teal font-medium" : "text-sediment hover:text-parchment"
              }`}
            >
              {options.mode === m.id && (
                <span
                  className="absolute inset-0 rounded-md bg-teal/15 border border-teal/30"
                  style={{ zIndex: -1 }}
                />
              )}
              {m.short}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => onOptionsChange({ ...options, caseSensitive: !options.caseSensitive })}
          aria-pressed={options.caseSensitive}
          title="Match case (Alt+C)"
          className={`rounded-lg border px-2.5 py-1 font-mono text-[11.5px] font-semibold tracking-tight transition-all duration-200 ${
            options.caseSensitive
              ? "border-gold/50 bg-gold/10 text-gold shadow-[0_0_8px_rgba(231,178,56,0.15)]"
              : "border-stone/80 text-sediment hover:border-teal/50 hover:text-teal"
          }`}
        >
          Aa
        </button>

        <button
          type="button"
          onClick={() => onOptionsChange({ ...options, regex: !options.regex })}
          aria-pressed={options.regex}
          title="Use regular expression (Alt+R)"
          className={`rounded-lg border px-2.5 py-1 font-mono text-[11.5px] font-semibold transition-all duration-200 ${
            options.regex
              ? "border-claim/50 bg-claim/10 text-claim shadow-[0_0_8px_rgba(171,139,214,0.15)]"
              : "border-stone/80 text-sediment hover:border-teal/50 hover:text-teal"
          }`}
        >
          .*
        </button>

        {error && <p className="w-full font-sans text-[11px] text-rust">{error}</p>}
      </div>
    </div>
  );
}
