import type { SearchMode, SearchOptions } from "../lib/types";
import { CaretIcon, SearchIcon, XIcon } from "./icons";

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
}

const MODES: { id: SearchMode; label: string }[] = [
  { id: "both", label: "Keys + values" },
  { id: "keys", label: "Keys" },
  { id: "values", label: "Values" },
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
}: SearchControlsProps) {
  return (
    <div className="rounded-lg border border-stone bg-panel p-3">
      <div className="flex items-center gap-2 rounded-md border border-stone bg-riverbed px-2.5 py-2 focus-within:border-gold/60">
        <SearchIcon className="h-4 w-4 shrink-0 text-sediment" />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (e.shiftKey) onPrev();
              else onNext();
            }
          }}
          type="text"
          placeholder="Search any field name or value…"
          className="w-full bg-transparent font-mono text-[13.5px] text-parchment outline-none placeholder:text-sediment-dim"
          aria-label="Search JSON fields and values"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            aria-label="Clear search"
            className="text-sediment hover:text-rust"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {query && (
        <div className="mt-2 flex items-center justify-between gap-2 font-mono text-[11.5px]">
          <span className={error ? "text-rust" : matchCount ? "text-gold" : "text-sediment"}>
            {error ? "Invalid pattern" : matchCount ? `${activeIndex + 1} of ${matchCount}` : "No matches"}
          </span>
          {!error && matchCount > 0 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onPrev}
                aria-label="Previous match"
                className="rounded border border-stone p-1 text-sediment hover:border-gold hover:text-gold"
              >
                <CaretIcon className="h-3 w-3 -rotate-90" />
              </button>
              <button
                type="button"
                onClick={onNext}
                aria-label="Next match"
                className="rounded border border-stone p-1 text-sediment hover:border-gold hover:text-gold"
              >
                <CaretIcon className="h-3 w-3 rotate-90" />
              </button>
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-1.5 font-sans text-[11.5px] text-rust">{error}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <div className="flex overflow-hidden rounded-md border border-stone">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onOptionsChange({ ...options, mode: m.id })}
              className={`px-2.5 py-1 font-sans text-[11px] transition-colors ${
                options.mode === m.id
                  ? "bg-teal/20 text-teal"
                  : "text-sediment hover:bg-panel-raised hover:text-parchment"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onOptionsChange({ ...options, caseSensitive: !options.caseSensitive })}
          aria-pressed={options.caseSensitive}
          title="Match case"
          className={`rounded-md border px-2 py-1 font-mono text-[11px] transition-colors ${
            options.caseSensitive
              ? "border-gold/60 text-gold"
              : "border-stone text-sediment hover:border-teal hover:text-teal"
          }`}
        >
          Aa
        </button>
        <button
          type="button"
          onClick={() => onOptionsChange({ ...options, regex: !options.regex })}
          aria-pressed={options.regex}
          title="Use regular expression"
          className={`rounded-md border px-2 py-1 font-mono text-[11px] transition-colors ${
            options.regex
              ? "border-gold/60 text-gold"
              : "border-stone text-sediment hover:border-teal hover:text-teal"
          }`}
        >
          .*
        </button>
      </div>
    </div>
  );
}
