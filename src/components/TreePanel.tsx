import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { List, useListRef } from "react-window";
import type { MatchRecord } from "../lib/types";
import type { VirtualRow } from "../lib/flattenTree";
import type { TreeRowProps } from "./VirtualRow";
import TreeRowComponentRaw from "./VirtualRow";

// react-window v2 expects rowComponent to return ReactElement | null, but memo() returns ReactNode.
// Cast to satisfy the type system while preserving memo behavior at runtime.
const TreeRowComponent = TreeRowComponentRaw as unknown as (props: {
  ariaAttributes: { "aria-posinset": number; "aria-setsize": number; role: "listitem" };
  index: number;
  style: React.CSSProperties;
} & TreeRowProps) => React.ReactElement | null;


interface TreePanelProps {
  hasData: boolean;
  flatRows: VirtualRow[];
  onToggle: (pathStr: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  matchMap: Map<string, MatchRecord>;
  activeId: string | null;
  onCopyPath: (pathStr: string) => void;
  copiedPath: string | null;
  scrollToId: string | null;
  onScrollDone: () => void;
}

const ROW_HEIGHT = 24;

export default function TreePanel({
  hasData,
  flatRows,
  onToggle,
  onExpandAll,
  onCollapseAll,
  matchMap,
  activeId,
  onCopyPath,
  copiedPath,
  scrollToId,
  onScrollDone,
}: TreePanelProps) {
  const listRef = useListRef(null);

  // Build an index from id → row index for O(1) scroll-to
  const idToIndex = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < flatRows.length; i++) {
      map.set(flatRows[i].id, i);
    }
    return map;
  }, [flatRows]);

  // Scroll to the target row when scrollToId changes
  useEffect(() => {
    if (!scrollToId || !listRef.current) return;
    const idx = idToIndex.get(scrollToId);
    if (idx !== undefined) {
      listRef.current.scrollToRow({ index: idx, align: "center" });
    }
    onScrollDone();
  }, [scrollToId, idToIndex, onScrollDone, listRef]);

  const rowKey = useCallback(
    (index: number) => flatRows[index].id,
    [flatRows]
  );

  // rowProps passed to each row component instance
  const rowProps: TreeRowProps = useMemo(
    () => ({
      flatRows,
      matchMap,
      activeId,
      onToggle,
      onCopyPath,
      copiedPath,
    }),
    [flatRows, matchMap, activeId, onToggle, onCopyPath, copiedPath]
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState<number>(400);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      if (el.clientHeight > 0) {
        setContainerHeight(el.clientHeight);
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-stone bg-panel h-full">
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

      <div className="sift-mesh min-h-0 flex-1 rounded-b-lg bg-riverbed/40 p-4">
        {!hasData ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-center">
            <p className="font-display text-lg text-parchment/80">No claim staked yet</p>
            <p className="max-w-xs font-sans text-[12.5px] leading-relaxed text-sediment">
              Paste JSON, upload a file, or load the sample to start prospecting.
            </p>
          </div>
        ) : (
          <div ref={containerRef} className="h-full w-full overflow-hidden">
            <List<TreeRowProps>
              listRef={listRef}
              rowCount={flatRows.length}
              rowHeight={ROW_HEIGHT}
              rowComponent={TreeRowComponent}
              rowProps={rowProps}
              rowKey={rowKey}
              height={containerHeight}
              overscanCount={30}
              className="tree-scroll"
              style={{ height: containerHeight, willChange: "transform" }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
