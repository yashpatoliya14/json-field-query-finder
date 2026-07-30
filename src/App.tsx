import { useCallback, useEffect, useMemo, useRef, useState, useDeferredValue } from "react";
import Header from "./components/Header";
import SourceControls from "./components/SourceControls";
import SearchControls from "./components/SearchControls";
import StatStrip from "./components/StatStrip";
import MatchLedger from "./components/MatchLedger";
import TreePanel from "./components/TreePanel";
import SqlConsole from "./components/SqlConsole";
import LightningZap from "./components/LightningZap";
import { sampleJsonText } from "./lib/sampleData";
import { computeStats, defaultExpanded } from "./lib/jsonTools";
import { useJsonWorker } from "./lib/useJsonWorker";
import { registerFileInDuckDB } from "./lib/duckdb";
import type { SearchOptions, JsonStats, MatchRecord, FindResult } from "./lib/types";

function mergeSets(a: Set<string>, b: Set<string>): Set<string> {
  let changed = false;
  const next = new Set(a);
  b.forEach((v) => {
    if (!next.has(v)) {
      next.add(v);
      changed = true;
    }
  });
  return changed ? next : a;
}

export default function App() {
  const { send } = useJsonWorker();

  const [draftText, setDraftText] = useState(sampleJsonText);
  const [hasData, setHasData] = useState(true);
  const [committedSize, setCommittedSize] = useState(() => new Blob([sampleJsonText]).size);
  const [parseError, setParseError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  
  // Tab layout state
  const [activeTab, setActiveTab] = useState<"tree" | "sql">("tree");

  // Lightning zap trigger — increment to fire a burst
  const [zapTrigger, setZapTrigger] = useState(0);
  const [zapOrigin, setZapOrigin] = useState<{ x: number; y: number } | undefined>(undefined);

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    // Parse sample data synchronously just for initial expanded paths
    try {
      return defaultExpanded(JSON.parse(sampleJsonText));
    } catch {
      return new Set(["$"]);
    }
  });
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [flatRows, setFlatRows] = useState<any[]>([]);

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  const [options, setOptions] = useState<SearchOptions>({
    mode: "both",
    caseSensitive: false,
    regex: false,
  });
  const [activeIndex, setActiveIndex] = useState(-1);
  const [scrollToId, setScrollToId] = useState<string | null>(null);

  // Stats — updated alongside committed
  const [stats, setStats] = useState<JsonStats>(() => {
    try {
      return computeStats(JSON.parse(sampleJsonText), committedSize);
    } catch {
      return computeStats(null, 0);
    }
  });

  // Search results managed separately so they can come from the worker
  const [findResult, setFindResult] = useState<FindResult>({
    matches: [],
    autoExpand: new Set(),
    error: null,
  });

  const [searching, setSearching] = useState(false);

  // Track the latest search request to ignore stale results
  const searchGenRef = useRef(0);
  const parseGenRef = useRef(0);

  // ─── Initial Load ────────────────────────────────────────────────────────
  useEffect(() => {
    // Register initial sample data in DuckDB
    const blob = new Blob([sampleJsonText], { type: "application/json" });
    registerFileInDuckDB(blob, "sift_data.json").catch(console.error);

    // Sync worker state with sample data
    send({ type: "parse", text: sampleJsonText });
  }, [send]);

  // ─── Flattening via worker ───────────────────────────────────────────────
  useEffect(() => {
    if (!hasData) {
      setFlatRows([]);
      return;
    }
    send({ type: "flatten", expandedPaths: Array.from(expanded) }).then((res) => {
      if (res.type === "flatten") {
        setFlatRows(res.flatRows);
      }
    });
  }, [expanded, hasData, send]);

  // ─── Core: apply text via worker ─────────────────────────────────────────
  const applyTextWorker = useCallback(
    async (text: string, origin?: { x: number; y: number }) => {
      const gen = ++parseGenRef.current;
      setProcessing(true);
      try {
        const res = await send({ type: "parse", text });
        if (gen !== parseGenRef.current) return; // stale

        if (res.type === "parse") {
          if (res.error) {
            setParseError(res.error);
            setProcessing(false);
            return;
          }
          setHasData(true);
          setCommittedSize(res.sizeBytes);
          setStats(res.stats);
          setParseError(null);
          setExpanded(new Set(res.defaultExpanded));

          // Register in DuckDB
          const blob = new Blob([text], { type: "application/json" });
          registerFileInDuckDB(blob, "sift_data.json").catch(console.error);

          // 🎉 Fire the lightning zap!
          setZapOrigin(origin);
          setZapTrigger((t) => t + 1);
        }
      } finally {
        if (gen === parseGenRef.current) setProcessing(false);
      }
    },
    [send]
  );

  // ─── Core: apply File via worker (streaming-like OPFS & postMessage) ─────
  const applyFileWorker = useCallback(
    async (file: File, origin?: { x: number; y: number }) => {
      const gen = ++parseGenRef.current;
      setProcessing(true);
      setParseError(null);
      try {
        const res = await send({ type: "parse", file });
        if (gen !== parseGenRef.current) return; // stale

        if (res.type === "parse") {
          if (res.error) {
            setParseError(res.error);
            setProcessing(false);
            return;
          }
          setHasData(true);
          setCommittedSize(res.sizeBytes);
          setStats(res.stats);
          setParseError(null);
          setExpanded(new Set(res.defaultExpanded));

          // Register in DuckDB
          registerFileInDuckDB(file, "sift_data.json").catch(console.error);

          // 🎉 Fire the lightning zap!
          setZapOrigin(origin);
          setZapTrigger((t) => t + 1);
        }
      } finally {
        if (gen === parseGenRef.current) setProcessing(false);
      }
    },
    [send]
  );

  // ─── Search via worker ────────────────────────────────────────────────────
  useEffect(() => {
    const gen = ++searchGenRef.current;
    const q = deferredQuery.trim();

    if (!q || !hasData) {
      setFindResult({ matches: [], autoExpand: new Set(), error: null });
      setSearching(false);
      return;
    }

    setSearching(true);
    send({ type: "search", query: q, options }).then((res) => {
      if (gen !== searchGenRef.current) return;
      setSearching(false);
      if (res.type === "search") {
        setFindResult({
          matches: res.matches as MatchRecord[],
          autoExpand: new Set(res.autoExpand),
          error: res.error,
        });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasData, deferredQuery, options.mode, options.caseSensitive, options.regex]);

  // When find result changes, auto-expand ancestors and scroll to first match
  useEffect(() => {
    if (findResult.matches.length) {
      setActiveIndex(0);
      setScrollToId(findResult.matches[0].pathStr);
    } else {
      setActiveIndex(-1);
      setScrollToId(null);
    }
    if (findResult.autoExpand.size) {
      setExpanded((prev) => mergeSets(prev, findResult.autoExpand));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findResult]);

  // ─── Handlers ────────────────────────────────────────────────────────────

  const handleDraftChange = useCallback((text: string) => {
    setDraftText(text);
  }, []);

  const handlePasteApply = useCallback(
    (text: string) => {
      setDraftText(text);
      void applyTextWorker(text, { x: window.innerWidth - 80, y: 56 });
    },
    [applyTextWorker]
  );

  const handleApply = useCallback(
    (e?: React.MouseEvent) => {
      const origin = e
        ? { x: e.clientX, y: e.clientY }
        : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      void applyTextWorker(draftText, origin);
    },
    [applyTextWorker, draftText]
  );

  const handleSample = useCallback(() => {
    setDraftText(sampleJsonText);
    void applyTextWorker(sampleJsonText, { x: window.innerWidth / 2, y: 56 });
  }, [applyTextWorker]);

  const handleClear = useCallback(() => {
    setDraftText("");
    setHasData(false);
    setCommittedSize(0);
    setStats(computeStats(null, 0));
    setParseError(null);
    setExpanded(new Set());
    setFlatRows([]);
    parseGenRef.current++;
  }, []);

  const handleFile = useCallback(
    (file: File) => {
      // Direct File upload bypasses main-thread readAsText completely!
      setDraftText(`[File: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)]`);
      setEditorOpen(false);
      void applyFileWorker(file, { x: window.innerWidth / 2, y: 56 });
    },
    [applyFileWorker]
  );

  const goToMatch = useCallback(
    (idx: number) => {
      const n = findResult.matches.length;
      if (!n) return;
      const clamped = ((idx % n) + n) % n;
      setActiveIndex(clamped);
      setScrollToId(findResult.matches[clamped].pathStr);
    },
    [findResult.matches]
  );

  const toggleExpand = useCallback((pathStr: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(pathStr)) next.delete(pathStr);
      else next.add(pathStr);
      return next;
    });
  }, []);

  const copyPath = useCallback((pathStr: string) => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(pathStr).catch(() => {});
    }
    setCopiedPath(pathStr);
    window.setTimeout(() => {
      setCopiedPath((p) => (p === pathStr ? null : p));
    }, 1400);
  }, []);

  const handleExpandAll = useCallback(async () => {
    if (!hasData) return;
    const res = await send({ type: "expandAll" });
    if (res.type === "expandAll") {
      setExpanded(new Set(res.paths));
    }
  }, [hasData, send]);

  const handleCollapseAll = useCallback(() => {
    setExpanded(new Set());
  }, []);

  const handleToggleEditor = useCallback(() => {
    setEditorOpen((v) => !v);
  }, []);

  const handleScrollDone = useCallback(() => {
    setScrollToId(null);
  }, []);

  const matchMap = useMemo(() => {
    return new Map(findResult.matches.map((m) => [m.pathStr, m] as const));
  }, [findResult]);

  const activeId = activeIndex >= 0 ? findResult.matches[activeIndex]?.pathStr ?? null : null;

  return (
    <div className="min-h-screen bg-riverbed font-sans text-parchment">
      {/* ⚡ Wow feature: lightning zap burst on parse complete */}
      <LightningZap
        trigger={zapTrigger}
        originX={zapOrigin?.x}
        originY={zapOrigin?.y}
      />

      <Header
        nodeCount={stats.nodes}
        matchCount={findResult.matches.length}
        hasQuery={query.trim().length > 0}
        processing={processing}
      />

      <main className="mx-auto flex max-w-[1400px] flex-col gap-4 px-5 py-5 sm:px-8 lg:h-[calc(100vh-77px)] lg:flex-row">
        <aside className="flex w-full flex-col gap-3 lg:h-full lg:w-[360px] lg:shrink-0 lg:overflow-hidden">
          <SourceControls
            editorOpen={editorOpen}
            onToggleEditor={handleToggleEditor}
            draftText={draftText}
            onDraftChange={handleDraftChange}
            onPasteApply={handlePasteApply}
            onApply={handleApply}
            onSample={handleSample}
            onClear={handleClear}
            onFile={handleFile}
            parseError={parseError}
            processing={processing}
          />

          <SearchControls
            query={query}
            onQueryChange={setQuery}
            options={options}
            onOptionsChange={setOptions}
            matchCount={findResult.matches.length}
            activeIndex={activeIndex}
            onNext={() => goToMatch(activeIndex + 1)}
            onPrev={() => goToMatch(activeIndex - 1)}
            error={findResult.error}
            searching={searching}
          />

          <StatStrip stats={stats} />

          <div className="min-h-0 flex-1">
            <MatchLedger
              matches={findResult.matches}
              activeIndex={activeIndex}
              onSelect={goToMatch}
              onCopyPath={copyPath}
              copiedPath={copiedPath}
              hasQuery={query.trim().length > 0}
              searching={searching}
            />
          </div>
        </aside>

        <section className="min-h-[480px] flex-1 lg:h-full flex flex-col gap-3">
          {/* Tab selector */}
          <div className="flex border-b border-stone/50">
            <button
              onClick={() => setActiveTab("tree")}
              className={`px-4 py-2 font-display text-[13.5px] font-medium border-b-2 transition-all ${
                activeTab === "tree"
                  ? "border-teal text-teal"
                  : "border-transparent text-sediment hover:text-parchment"
              }`}
            >
              Tree View
            </button>
            <button
              onClick={() => setActiveTab("sql")}
              className={`px-4 py-2 font-display text-[13.5px] font-medium border-b-2 transition-all ${
                activeTab === "sql"
                  ? "border-teal text-teal"
                  : "border-transparent text-sediment hover:text-parchment"
              }`}
            >
              SQL Console (DuckDB)
            </button>
          </div>

          <div className="flex-1 min-h-0">
            {activeTab === "tree" ? (
              <TreePanel
                hasData={hasData}
                flatRows={flatRows}
                onToggle={toggleExpand}
                onExpandAll={handleExpandAll}
                onCollapseAll={handleCollapseAll}
                matchMap={matchMap}
                activeId={activeId}
                onCopyPath={copyPath}
                copiedPath={copiedPath}
                scrollToId={scrollToId}
                onScrollDone={handleScrollDone}
              />
            ) : (
              <SqlConsole hasData={hasData} fileName="sift_data.json" />
            )}
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-[1400px] px-5 pb-6 pt-1 sm:px-8">
        <p className="font-sans text-[11px] text-sediment-dim">
          Sift runs entirely in your browser — nothing you paste ever leaves this tab. ⚡ Powered by DuckDB-Wasm & Web Workers.
        </p>
      </footer>
    </div>
  );
}
