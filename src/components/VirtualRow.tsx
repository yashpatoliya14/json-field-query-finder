import { memo } from "react";
import type { MatchRecord, Range } from "../lib/types";
import type { FlatRow, ClosingRow } from "../lib/flattenTree";
import type { VirtualRow as VirtualRowType } from "../lib/flattenTree";
import Highlight from "./Highlight";
import { CaretIcon, CopyIcon } from "./icons";

const INDENT = 18;

function valueClasses(type: string) {
  switch (type) {
    case "string":
      return "text-parchment/90";
    case "number":
      return "text-signal";
    case "boolean":
      return "text-claim";
    case "null":
      return "text-sediment-dim italic";
    default:
      return "text-parchment";
  }
}

function KeyLabel({
  nodeKey,
  isIndex,
  ranges,
}: {
  nodeKey: string | number;
  isIndex: boolean;
  ranges: Range[];
}) {
  if (isIndex) {
    return <span className="text-sediment-dim">{nodeKey}</span>;
  }
  return (
    <span className="text-teal">
      "<Highlight text={String(nodeKey)} ranges={ranges} />"
    </span>
  );
}

function LeafValueDisplay({
  value,
  ranges,
}: {
  value: unknown;
  ranges: Range[];
}) {
  if (typeof value === "string") {
    return (
      <span className="text-parchment/90">
        "<Highlight text={value} ranges={ranges} />"
      </span>
    );
  }
  const text = value === null ? "null" : String(value);
  const type =
    value === null ? "null" : typeof value === "boolean" ? "boolean" : "number";
  return (
    <span className={valueClasses(type)}>
      <Highlight text={text} ranges={ranges} />
    </span>
  );
}

export interface TreeRowProps {
  flatRows: VirtualRowType[];
  matchMap: Map<string, MatchRecord>;
  activeId: string | null;
  onToggle: (pathStr: string) => void;
  onCopyPath: (pathStr: string) => void;
  copiedPath: string | null;
}

function TreeRowComponent({
  index,
  style,
  flatRows,
  matchMap,
  activeId,
  onToggle,
  onCopyPath,
  copiedPath,
}: {
  index: number;
  style: React.CSSProperties;
} & TreeRowProps): React.ReactElement | null {
  const row = flatRows[index];

  // Closing brace row
  if (row.kind === "closing") {
    const cr = row as ClosingRow;
    const comma = !cr.isLast ? "," : "";
    return (
      <div
        style={{ ...style, paddingLeft: cr.depth * INDENT + 6 }}
        className="font-mono text-[13px] leading-[1.55] text-sediment-dim"
      >
        {cr.closeBrace}
        {comma}
      </div>
    );
  }

  const fr = row as FlatRow;
  const match = matchMap.get(fr.id);
  const isActive = activeId === fr.id;
  const isCopied = copiedPath === fr.id;
  const indentPx = fr.depth * INDENT;
  const comma = !fr.isLast ? "," : "";

  const rowBase =
    "group relative flex items-start gap-1 rounded-[4px] px-1.5 -mx-1.5 py-[1px] font-mono text-[13px] leading-[1.55] hover:bg-panel-raised/60";
  const rowState = match ? "bg-gold/[0.06]" : "";
  const rowActive = isActive ? "match-active ring-1 ring-gold/60" : "";

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCopyPath(fr.id);
  };

  const copyButton = (
    <button
      type="button"
      onClick={handleCopy}
      title="Copy path"
      aria-label={`Copy path ${fr.id}`}
      className="ml-2 hidden shrink-0 items-center gap-1 rounded border border-stone px-1 py-px text-[10px] text-sediment hover:border-teal hover:text-teal group-hover:flex"
    >
      {isCopied ? (
        <span className="text-teal">copied</span>
      ) : (
        <CopyIcon className="h-2.5 w-2.5" />
      )}
    </button>
  );

  // Leaf node
  if (fr.kind === "leaf") {
    return (
      <div
        id={fr.id}
        className={`${rowBase} ${rowState} ${rowActive}`}
        style={{ ...style, paddingLeft: indentPx + 6 }}
      >
        <span className="select-none text-sediment-dim" aria-hidden>
          &nbsp;
        </span>
        {fr.nodeKey !== null && (
          <>
            <KeyLabel
              nodeKey={fr.nodeKey}
              isIndex={fr.isIndex}
              ranges={match?.keyRanges ?? []}
            />
            <span className="text-sediment-dim">:</span>
          </>
        )}
        <LeafValueDisplay value={fr.value} ranges={match?.valueRanges ?? []} />
        <span className="text-sediment-dim">{comma}</span>
        {copyButton}
      </div>
    );
  }

  // Empty container
  if (fr.kind === "empty") {
    return (
      <div
        id={fr.id}
        className={`${rowBase} ${rowState} ${rowActive}`}
        style={{ ...style, paddingLeft: indentPx + 6 }}
      >
        <span className="select-none text-sediment-dim" aria-hidden>
          &nbsp;
        </span>
        {fr.nodeKey !== null && (
          <>
            <KeyLabel
              nodeKey={fr.nodeKey}
              isIndex={fr.isIndex}
              ranges={match?.keyRanges ?? []}
            />
            <span className="text-sediment-dim">:</span>
          </>
        )}
        <span className="text-sediment-dim">
          {fr.openBrace}
          {fr.closeBrace}
          {comma}
        </span>
        {copyButton}
      </div>
    );
  }

  // Container (open or closed)
  const isOpen = fr.kind === "open";
  const countLabel = fr.isArr
    ? `${fr.entryCount} item${fr.entryCount === 1 ? "" : "s"}`
    : `${fr.entryCount} key${fr.entryCount === 1 ? "" : "s"}`;

  const handleToggle = () => onToggle(fr.id);

  // Use div+role instead of <button> so the copy <button> inside is valid HTML.
  return (
    <div
      id={fr.id}
      role="button"
      tabIndex={0}
      onClick={handleToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleToggle();
        }
      }}
      className={`${rowBase} ${rowState} ${rowActive} w-full cursor-pointer text-left`}
      style={{ ...style, paddingLeft: indentPx + 6 }}
      aria-expanded={isOpen}
    >
      <CaretIcon
        className={`mt-[5px] h-2.5 w-2.5 shrink-0 text-sediment-dim transition-transform ${isOpen ? "rotate-90" : ""}`}
      />
      {fr.nodeKey !== null && (
        <>
          <KeyLabel
            nodeKey={fr.nodeKey}
            isIndex={fr.isIndex}
            ranges={match?.keyRanges ?? []}
          />
          <span className="text-sediment-dim">:</span>
        </>
      )}
      <span className="text-sediment-dim">{fr.openBrace}</span>
      {!isOpen && (
        <>
          <span className="italic text-sediment-dim/80">
            &nbsp;{countLabel}&nbsp;
          </span>
          <span className="text-sediment-dim">
            {fr.closeBrace}
            {comma}
          </span>
        </>
      )}
      {copyButton}
    </div>
  );
}

export default memo(TreeRowComponent);
