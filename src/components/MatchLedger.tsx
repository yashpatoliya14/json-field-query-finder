import { useCallback, useEffect, useMemo, useRef, memo } from "react";
import { List, useListRef } from "react-window";
import type { MatchRecord } from "../lib/types";
import { shortPreview } from "../lib/jsonTools";
import Highlight from "./Highlight";
import { CopyIcon } from "./icons";

interface MatchLedgerProps {
  matches: MatchRecord[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onCopyPath: (pathStr: string) => void;
  copiedPath: string | null;
  hasQuery: boolean;
  searching: boolean;
}

const MATCH_ROW_HEIGHT = 68;

const TYPE_CHIP: Record<string, { label: string; cls: string }> = {
  string: { label: "str", cls: "bg-parchment/10 text-parchment/80" },
  number: { label: "num", cls: "bg-signal/15 text-signal" },
  boolean: { label: "bool", cls: "bg-claim/15 text-claim" },
  null: { label: "null", cls: "bg-sediment-dim/20 text-sediment" },
  array: { label: "[ ]", cls: "bg-rust/15 text-rust" },
  object: { label: "{ }", cls: "bg-teal-dim text-teal" },
};

interface MatchRowStableRefs {
  activeIndexRef: React.RefObject<number>;
  copiedPathRef: React.RefObject<string | null>;
}

interface MatchRowProps {
  matches: MatchRecord[];
  stableRefs: MatchRowStableRefs;
  onSelect: (index: number) => void;
  onCopyPath: (pathStr: string) => void;
}

function MatchRowComponentFn({
  index,
  style,
  matches,
  stableRefs,
  onSelect,
  onCopyPath,
}: {
  index: number;
  style: React.CSSProperties;
} & MatchRowProps): React.ReactElement | null {
  const m = matches[index];
  // Read from refs — not subscribed, won't cause re-render of this row
  const isActive = stableRefs.activeIndexRef.current === index;
  const isCopied = stableRefs.copiedPathRef.current === m.pathStr;
  const chip = TYPE_CHIP[m.valueType] ?? TYPE_CHIP["string"];

  const displayPath =
    m.pathStr.length > 44 ? "…" + m.pathStr.slice(-43) : m.pathStr;

  return (
    <li style={style} className="px-1.5 py-0.5">
      <button
        type="button"
        onClick={() => onSelect(index)}
        className={`group flex w-full flex-col gap-1 rounded-lg border px-2.5 py-2 text-left transition-all duration-150 ${
          isActive
            ? "border-gold/50 bg-gold/[0.07] shadow-[0_0_0_1px_rgba(231,178,56,0.15)]"
            : "border-transparent bg-riverbed/40 hover:border-stone/80 hover:bg-panel-raised/50"
        }`}
        style={{ height: MATCH_ROW_HEIGHT - 4 }}
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className="truncate font-mono text-[11px] text-teal/90 group-hover:text-teal"
            title={m.pathStr}
          >
            {displayPath}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCopyPath(m.pathStr);
            }}
            aria-label="Copy path"
            className="shrink-0 opacity-0 transition-all group-hover:opacity-100"
          >
            {isCopied ? (
              <span className="font-mono text-[10px] text-teal">✓ copied</span>
            ) : (
              <CopyIcon className="h-3 w-3 text-sediment-dim hover:text-teal" />
            )}
          </button>
        </div>

        {m.matchedOn.includes("key") && (
          <div className="flex items-center gap-1.5 overflow-hidden">
            <span className="shrink-0 rounded bg-teal-dim px-1 py-[1px] font-mono text-[9px] uppercase tracking-wide text-teal">
              key
            </span>
            <span className="truncate font-mono text-[11.5px] text-teal/80">
              <Highlight text={String(m.key)} ranges={m.keyRanges} />
            </span>
          </div>
        )}

        {m.matchedOn.includes("value") && (
          <div className="flex items-center gap-1.5 overflow-hidden">
            <span
              className={`shrink-0 rounded px-1 py-[1px] font-mono text-[9px] uppercase tracking-wide ${chip.cls}`}
            >
              {chip.label}
            </span>
            <span className="truncate font-mono text-[11.5px] text-parchment/80">
              <Highlight
                text={shortPreview(m.value, 52)}
                ranges={m.valueRanges}
              />
            </span>
          </div>
        )}
      </button>
    </li>
  );
}

const MatchRowComponent = memo(MatchRowComponentFn) as unknown as (
  props: {
    ariaAttributes: {
      "aria-posinset": number;
      "aria-setsize": number;
      role: "listitem";
    };
    index: number;
    style: React.CSSProperties;
  } & MatchRowProps,
) => React.ReactElement | null;

export default function MatchLedger({
  matches,
  activeIndex,
  onSelect,
  onCopyPath,
  copiedPath,
  hasQuery,
  searching,
}: MatchLedgerProps) {
  const listRef = useListRef(null);

  // Stable refs — identity never changes, so rowProps never busts
  const activeIndexRef = useRef<number>(activeIndex);
  const copiedPathRef = useRef<string | null>(copiedPath);
  activeIndexRef.current = activeIndex;
  copiedPathRef.current = copiedPath;

  const stableRefs: MatchRowStableRefs = useMemo(
    () => ({ activeIndexRef, copiedPathRef }),
    [], // refs are stable objects — safe empty deps
  );

  // Scroll active row into view
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      listRef.current.scrollToRow({ index: activeIndex, align: "center" });
    }
  }, [activeIndex, listRef]);

  // rowProps only changes when matches/callbacks change — NOT on activeIndex/copiedPath
  const rowProps: MatchRowProps = useMemo(
    () => ({ matches, stableRefs, onSelect, onCopyPath }),
    [matches, stableRefs, onSelect, onCopyPath],
  );

  const rowKey = useCallback(
    (index: number) => matches[index].pathStr,
    [matches],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-stone/80 bg-panel h-full overflow-hidden">
      <div className="flex items-center justify-between border-b border-stone/60 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="font-sans text-[11px] font-medium uppercase tracking-[0.12em] text-sediment">
            Matches
          </span>
          {searching && (
            <span className="h-1.5 w-1.5 rounded-full bg-teal animate-ping" />
          )}
        </div>
        <span
          className={`rounded-md px-2 py-0.5 font-mono text-[11px] transition-all duration-300 ${
            matches.length > 0 ? "bg-gold/10 text-gold" : "text-sediment-dim"
          }`}
        >
          {matches.length > 0 ? matches.length.toLocaleString() : "—"}
        </span>
      </div>

      {!hasQuery && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-8 text-center">
          <svg
            viewBox="0 0 24 24"
            className="h-8 w-8 text-stone"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M16.5 16.5l4 4" strokeLinecap="round" />
          </svg>
          <p className="font-sans text-[12px] leading-relaxed text-sediment-dim">
            Type in the search bar to find matching fields and values
          </p>
        </div>
      )}

      {hasQuery && !searching && matches.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-8 text-center">
          <svg
            viewBox="0 0 24 24"
            className="h-8 w-8 text-stone"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M16.5 16.5l4 4" strokeLinecap="round" />
            <path d="M9 9l4 4M13 9l-4 4" strokeLinecap="round" />
          </svg>
          <p className="font-sans text-[12px] text-sediment-dim">
            Nothing matched — try a different term
          </p>
        </div>
      )}

      {matches.length > 0 && (
        <div className="min-h-0 flex-1">
          <List<MatchRowProps>
            listRef={listRef}
            rowCount={matches.length}
            rowHeight={MATCH_ROW_HEIGHT}
            rowComponent={MatchRowComponent}
            rowProps={rowProps}
            rowKey={rowKey}
            overscanCount={12}
            className="ledger-scroll"
            style={{ height: "100%" }}
          />
        </div>
      )}
    </div>
  );
}
