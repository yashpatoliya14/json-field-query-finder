import { memo } from "react";
import type { JsonValue, MatchRecord, PathSegment } from "../lib/types";
import { formatPath, isContainer, valueTypeOf } from "../lib/jsonTools";
import Highlight from "./Highlight";
import { CaretIcon, CopyIcon } from "./icons";

interface JsonNodeProps {
  nodeKey: string | number | null;
  isIndex: boolean;
  value: JsonValue;
  path: PathSegment[];
  depth: number;
  isLast: boolean;
  expanded: Set<string>;
  onToggle: (pathStr: string) => void;
  matchMap: Map<string, MatchRecord>;
  activeId: string | null;
  onCopyPath: (pathStr: string) => void;
  copiedPath: string | null;
}

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
  ranges: MatchRecord["keyRanges"];
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

function LeafValue({ value, ranges }: { value: JsonValue; ranges: MatchRecord["valueRanges"] }) {
  const type = valueTypeOf(value);
  if (typeof value === "string") {
    return (
      <span className={valueClasses(type)}>
        "<Highlight text={value} ranges={ranges} />"
      </span>
    );
  }
  const text = value === null ? "null" : String(value);
  return (
    <span className={valueClasses(type)}>
      <Highlight text={text} ranges={ranges} />
    </span>
  );
}

function JsonNode({
  nodeKey,
  isIndex,
  value,
  path,
  depth,
  isLast,
  expanded,
  onToggle,
  matchMap,
  activeId,
  onCopyPath,
  copiedPath,
}: JsonNodeProps) {
  const pathStr = formatPath(path);
  const match = matchMap.get(pathStr);
  const isActive = activeId === pathStr;
  const container = isContainer(value);
  const isOpen = expanded.has(pathStr);
  const indentPx = depth * INDENT;
  const comma = !isLast ? "," : "";

  const rowBase =
    "group relative flex items-start gap-1 rounded-[4px] px-1.5 -mx-1.5 py-[1px] font-mono text-[13px] leading-[1.55] hover:bg-panel-raised/60";
  const rowState = match ? "bg-gold/[0.06]" : "";
  const rowActive = isActive ? "match-active ring-1 ring-gold/60" : "";

  const copyButton = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onCopyPath(pathStr);
      }}
      title="Copy path"
      aria-label={`Copy path ${pathStr}`}
      className="ml-2 hidden shrink-0 items-center gap-1 rounded border border-stone px-1 py-[1px] text-[10px] text-sediment hover:border-teal hover:text-teal group-hover:flex"
    >
      {copiedPath === pathStr ? (
        <span className="text-teal">copied</span>
      ) : (
        <CopyIcon className="h-2.5 w-2.5" />
      )}
    </button>
  );

  if (!container) {
    return (
      <div id={pathStr} className={`${rowBase} ${rowState} ${rowActive}`} style={{ paddingLeft: indentPx + 6 }}>
        <span className="select-none text-sediment-dim" aria-hidden>
          &nbsp;
        </span>
        {nodeKey !== null && (
          <>
            <KeyLabel nodeKey={nodeKey} isIndex={isIndex} ranges={match?.keyRanges ?? []} />
            <span className="text-sediment-dim">:</span>
          </>
        )}
        <LeafValue value={value} ranges={match?.valueRanges ?? []} />
        <span className="text-sediment-dim">{comma}</span>
        {copyButton}
      </div>
    );
  }

  const isArr = Array.isArray(value);
  const entries: [string | number, JsonValue][] = isArr
    ? (value as JsonValue[]).map((v, i) => [i, v] as [number, JsonValue])
    : Object.entries(value as Record<string, JsonValue>);
  const openBrace = isArr ? "[" : "{";
  const closeBrace = isArr ? "]" : "}";
  const countLabel = isArr
    ? `${entries.length} item${entries.length === 1 ? "" : "s"}`
    : `${entries.length} key${entries.length === 1 ? "" : "s"}`;

  if (entries.length === 0) {
    return (
      <div id={pathStr} className={`${rowBase} ${rowState} ${rowActive}`} style={{ paddingLeft: indentPx + 6 }}>
        <span className="select-none text-sediment-dim" aria-hidden>
          &nbsp;
        </span>
        {nodeKey !== null && (
          <>
            <KeyLabel nodeKey={nodeKey} isIndex={isIndex} ranges={match?.keyRanges ?? []} />
            <span className="text-sediment-dim">:</span>
          </>
        )}
        <span className="text-sediment-dim">
          {openBrace}
          {closeBrace}
          {comma}
        </span>
        {copyButton}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        id={pathStr}
        onClick={() => onToggle(pathStr)}
        className={`${rowBase} ${rowState} ${rowActive} w-full cursor-pointer text-left`}
        style={{ paddingLeft: indentPx + 6 }}
        aria-expanded={isOpen}
      >
        <CaretIcon
          className={`mt-[5px] h-2.5 w-2.5 shrink-0 text-sediment-dim transition-transform ${isOpen ? "rotate-90" : ""}`}
        />
        {nodeKey !== null && (
          <>
            <KeyLabel nodeKey={nodeKey} isIndex={isIndex} ranges={match?.keyRanges ?? []} />
            <span className="text-sediment-dim">:</span>
          </>
        )}
        <span className="text-sediment-dim">{openBrace}</span>
        {!isOpen && (
          <>
            <span className="italic text-sediment-dim/80">&nbsp;{countLabel}&nbsp;</span>
            <span className="text-sediment-dim">
              {closeBrace}
              {comma}
            </span>
          </>
        )}
        {copyButton}
      </button>
      {isOpen && (
        <>
          {entries.map(([k, v], i) => (
            <JsonNode
              key={String(k)}
              nodeKey={k}
              isIndex={isArr}
              value={v}
              path={[...path, { key: k, isIndex: isArr }]}
              depth={depth + 1}
              isLast={i === entries.length - 1}
              expanded={expanded}
              onToggle={onToggle}
              matchMap={matchMap}
              activeId={activeId}
              onCopyPath={onCopyPath}
              copiedPath={copiedPath}
            />
          ))}
          <div
            className="font-mono text-[13px] leading-[1.55] text-sediment-dim"
            style={{ paddingLeft: indentPx + 6 }}
          >
            {closeBrace}
            {comma}
          </div>
        </>
      )}
    </div>
  );
}

export default memo(JsonNode);
