import { useCallback, useEffect, useMemo, memo } from "react";
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
}

const MATCH_ROW_HEIGHT = 64;

interface MatchRowProps {
  matches: MatchRecord[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onCopyPath: (pathStr: string) => void;
  copiedPath: string | null;
}

function MatchRowComponentFn({
  index,
  style,
  matches,
  activeIndex,
  onSelect,
  onCopyPath,
  copiedPath,
}: {
  index: number;
  style: React.CSSProperties;
} & MatchRowProps): React.ReactElement | null {
  const m = matches[index];
  const isActive = index === activeIndex;
  const isCopied = copiedPath === m.pathStr;

  return (
    <li style={style}>
      <button
        type="button"
        onClick={() => onSelect(index)}
        className={`group mb-1 flex w-full flex-col gap-1 rounded-md border px-2.5 py-2 text-left transition-colors ${
          isActive
            ? "border-gold/60 bg-gold/[0.08]"
            : "border-transparent hover:border-stone hover:bg-panel-raised/60"
        }`}
        style={{ height: MATCH_ROW_HEIGHT - 4 }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-mono text-[11px] text-teal">{m.pathStr}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCopyPath(m.pathStr);
            }}
            aria-label="Copy path"
            className="shrink-0 text-sediment-dim opacity-0 hover:text-teal group-hover:opacity-100"
          >
            {isCopied ? (
              <span className="font-mono text-[10px] text-teal">copied</span>
            ) : (
              <CopyIcon className="h-3 w-3" />
            )}
          </button>
        </div>
        {m.matchedOn.includes("key") && (
          <div className="flex items-center gap-1.5 font-mono text-[12px]">
            <span className="rounded bg-teal-dim px-1 py-[1px] text-[9.5px] uppercase tracking-wide text-teal">
              key
            </span>
            <span className="truncate text-teal/90">
              <Highlight text={String(m.key)} ranges={m.keyRanges} />
            </span>
          </div>
        )}
        {m.matchedOn.includes("value") && (
          <div className="flex items-center gap-1.5 font-mono text-[12.5px]">
            <span className="rounded bg-stone-soft px-1 py-[1px] text-[9.5px] uppercase tracking-wide text-sediment">
              {m.valueType}
            </span>
            <span className="truncate text-parchment/90">
              <Highlight text={shortPreview(m.value, 48)} ranges={m.valueRanges} />
            </span>
          </div>
        )}
      </button>
    </li>
  );
}

const MatchRowComponentMemo = memo(MatchRowComponentFn);

// Cast to satisfy react-window v2's strict type that expects ReactElement | null return
const MatchRowComponent = MatchRowComponentMemo as unknown as (props: {
  ariaAttributes: { "aria-posinset": number; "aria-setsize": number; role: "listitem" };
  index: number;
  style: React.CSSProperties;
} & MatchRowProps) => React.ReactElement | null;

export default function MatchLedger({
  matches,
  activeIndex,
  onSelect,
  onCopyPath,
  copiedPath,
  hasQuery,
}: MatchLedgerProps) {
  const listRef = useListRef(null);

  // Scroll active match into view
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      listRef.current.scrollToRow({ index: activeIndex, align: "center" });
    }
  }, [activeIndex, listRef]);

  const rowKey = useCallback(
    (index: number) => matches[index].pathStr,
    [matches]
  );

  const rowProps: MatchRowProps = useMemo(
    () => ({
      matches,
      activeIndex,
      onSelect,
      onCopyPath,
      copiedPath,
    }),
    [matches, activeIndex, onSelect, onCopyPath, copiedPath]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-stone bg-panel h-full">
      <div className="flex items-center justify-between border-b border-stone/70 px-3 py-2">
        <span className="font-sans text-[11px] font-medium uppercase tracking-[0.12em] text-sediment">
          Ledger
        </span>
        <span className="font-mono text-[11px] text-sediment-dim">{matches.length}</span>
      </div>

      {!hasQuery && (
        <div className="flex flex-1 items-center px-3 py-6 text-center font-sans text-[12px] leading-relaxed text-sediment-dim">
          Every field or value you find gets logged here with its exact path — type in the search bar to
          start filling the ledger.
        </div>
      )}

      {hasQuery && matches.length === 0 && (
        <div className="flex flex-1 items-center px-3 py-6 text-center font-sans text-[12px] leading-relaxed text-sediment-dim">
          Nothing turned up. Try a shorter term, switch modes, or toggle case sensitivity.
        </div>
      )}

      {matches.length > 0 && (
        <div className="min-h-0 flex-1 p-1.5">
          <List<MatchRowProps>
            listRef={listRef}
            rowCount={matches.length}
            rowHeight={MATCH_ROW_HEIGHT}
            rowComponent={MatchRowComponent}
            rowProps={rowProps}
            rowKey={rowKey}
            overscanCount={10}
            className="ledger-scroll"
            style={{ height: "100%" }}
          />
        </div>
      )}
    </div>
  );
}
