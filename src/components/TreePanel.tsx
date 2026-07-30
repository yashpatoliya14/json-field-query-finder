import type { JsonValue, MatchRecord } from "../lib/types";
import JsonNode from "./JsonNode";

interface TreePanelProps {
  root: JsonValue | null;
  isLoading?: boolean;
  expanded: Set<string>;
  onToggle: (pathStr: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  matchMap: Map<string, MatchRecord>;
  activeId: string | null;
  onCopyPath: (pathStr: string) => void;
  copiedPath: string | null;
}

export default function TreePanel({
  root,
  isLoading = false,
  expanded,
  onToggle,
  onExpandAll,
  onCollapseAll,
  matchMap,
  activeId,
  onCopyPath,
  copiedPath,
}: TreePanelProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-stone bg-panel">
      <div className="flex items-center justify-between border-b border-stone/70 px-3 py-2">
        <span className="font-sans text-[11px] font-medium uppercase tracking-[0.12em] text-sediment">
          Claim map
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onExpandAll}
            className="rounded border border-stone px-2 py-1 font-sans text-[11px] text-sediment hover:border-teal hover:text-teal"
          >
            Expand all
          </button>
          <button
            type="button"
            onClick={onCollapseAll}
            className="rounded border border-stone px-2 py-1 font-sans text-[11px] text-sediment hover:border-teal hover:text-teal"
          >
            Collapse all
          </button>
        </div>
      </div>

      <div className="tree-scroll sift-mesh min-h-0 flex-1 overflow-auto rounded-b-lg bg-riverbed/40 p-4">
        {isLoading ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-stone border-t-teal" aria-hidden />
            <p className="font-sans text-[13px] text-sediment">Preparing claim map…</p>
          </div>
        ) : root === null || root === undefined ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-center">
            <p className="font-display text-lg text-parchment/80">No claim staked yet</p>
            <p className="max-w-xs font-sans text-[12.5px] leading-relaxed text-sediment">
              Paste JSON, upload a file, or load the sample to start prospecting.
            </p>
          </div>
        ) : (
          <JsonNode
            nodeKey={null}
            isIndex={false}
            value={root}
            path={[]}
            depth={0}
            isLast={true}
            expanded={expanded}
            onToggle={onToggle}
            matchMap={matchMap}
            activeId={activeId}
            onCopyPath={onCopyPath}
            copiedPath={copiedPath}
          />
        )}
      </div>
    </div>
  );
}
