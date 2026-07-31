import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Header from "./components/Header";
import SourceControls from "./components/SourceControls";
import SearchControls from "./components/SearchControls";
import StatStrip from "./components/StatStrip";
import MatchLedger from "./components/MatchLedger";
import TreePanel from "./components/TreePanel";
import SqlConsole from "./components/SqlConsole";
import LightningZap from "./components/LightningZap";
import { sampleJsonText } from "./lib/sampleData";
import { computeStats, defaultExpanded, allContainerPaths } from "./lib/jsonTools";
import { flattenTree } from "./lib/flattenTree";
import { useJsonWorker } from "./lib/useJsonWorker";
import { registerFileInDuckDB } from "./lib/duckdb";
import type { SearchOptions, JsonStats, MatchRecord, FindResult, JsonValue } from "./lib/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Merge set B into set A. Returns A unchanged (same reference) when nothing
 * was actually added — avoids triggering downstream effects/memos.
 */
function mergeSets(a: Set<string>, b: Set<string>): Set<string> {
  // Fast path: if every element of b is already in a, return a as-is.
  let allPresent = true;
  b.forEach((v) => { if (!a.has(v)) { allPresent = false; } });
  if (allPresent) return a;

  const next = new Set(a);
  b.forEach((v) => next.add(v));
  return next;
}

function getPathAncestors(pathStr: string): string[] {
  const ancestors: string[] = ["$"];
  if (pathStr === "$") return ancestors;
  let i = 1;
  while (i < pathStr.length) {
    if (pathStr[i] === ".") {
      const nextDot = pathStr.indexOf(".", i + 1);
      const nextBracket = pathStr.indexOf("[", i + 1);
      let next = -1;
      if (nextDot !== -1 && nextBracket !== -1) next = Math.min(nextDot, nextBracket);
      else next = nextDot !== -1 ? nextDot : nextBracket;
      if (next === -1) { ancestors.push(pathStr); break; }
      ancestors.push(pathStr.substring(0, next));
      i = next;
    } else if (pathStr[i] === "[") {
      const close = pathStr.indexOf("]", i + 1);
      if (close === -1) break;
      ancestors.push(pathStr.substring(0, close + 1));
      i = close + 1;
    } else {
      i++;
    }
  }
  return ancestors;
}

// Parse sampleData once at module level so the initial state is free.
const INITIAL_JSON = (() => {
  try { return JSON.parse(sampleJsonText) as JsonValue; } catch { return null; }
})();

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const { send } = useJsonWorker();

  // ── Source state ──────────────────────────────────────────────────────────
  const [draftText, setDraftText] = useState(sampleJsonText);
  const [hasData, setHasData] = useState(true);
  const [committedSize, setCommittedSize] = useState(() => new Blob([sampleJsonText]).size);
  const [parseError, setParseError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [processing, setProcessing] = useState(false);

  /**
   * The parsed JSON root lives on the MAIN THREAD.
   * flattenTree runs synchronously via useMemo — zero worker round-trips.
   */
  const [jsonRoot, setJsonRoot] = useState<JsonValue | null>(INITIAL_JSON);

  // ── Tab / animation state ─────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"tree" | "sql">("tree");
  const [zapTrigger, setZapTrigger] = useState(0);
  const [zapOrigin, setZapOrigin] = useState<{ x: number; y: number } | undefined>(undefined);

  // ── Tree expansion state ──────────────────────────────────────────────────
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    try { return defaultExpanded(INITIAL_JSON); }
    catch { return new Set(["$"]); }
  });
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  /**
   * Flat rows for the virtual list — computed synchronously on the main thread.
   * No worker round-trip, no postMessage serialization overhead.
   * React will batch this memo with the render that triggered it.
   */
  const flatRows = useMemo(
    () => flattenTree(jsonRoot, expanded),
    [jsonRoot, expanded]
  );

  // ── Search state ──────────────────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingQuery, setPendingQuery] = useState("");

  const handleQueryChange = useCallback((q: string) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) {
      // Clear immediately — no debounce needed for empty
      setPendingQuery("");
      return;
    }
    debounceRef.current = setTimeout(() => setPendingQuery(q), 200);
  }, []);

  const [options, setOptions] = useState<SearchOptions>({
    mode: "both",
    caseSensitive: false,
    regex: false,
  });
  const [activeIndex, setActiveIndex] = useState(-1);
  const [scrollToId, setScrollToId] = useState<string | null>(null);

  const [stats, setStats] = useState<JsonStats>(() => {
    try { return computeStats(INITIAL_JSON, new Blob([sampleJsonText]).size); }
    catch { return computeStats(null, 0); }
  });

  const [findResult, setFindResult] = useState<FindResult>({
    matches: [],
    autoExpand: new Set(),
    error: null,
  });

  const [searching, setSearching] = useState(false);
  const [lastSearchMs, setLastSearchMs] = useState<number | null>(null);

  const searchGenRef = useRef(0);
  const parseGenRef = useRef(0);

  // ─── Initial load ──────────────────────────────────────────────────────────
  // Send sample data to the worker's DuckDB (for SQL search).
  // flattenTree + parse happen on main thread — no "flatten" message needed.
  useEffect(() => {
    send({ type: "parse", text: sampleJsonText });
    const blob = new Blob([sampleJsonText], { type: "application/json" });
    registerFileInDuckDB(blob, "sift_data.json").catch(console.error);
  }, [send]);

  // ─── Search via DuckDB worker ──────────────────────────────────────────────
  useEffect(() => {
    const gen = ++searchGenRef.current;
    const q = pendingQuery.trim();

    if (!q || !hasData) {
      setFindResult({ matches: [], autoExpand: new Set(), error: null });
      setSearching(false);
      setLastSearchMs(null);
      return;
    }

    setSearching(true);

    send({ type: "search", query: q, options }).then((res) => {
      if (gen !== searchGenRef.current) return;   // stale — discard
      setSearching(false);
      if (res.type === "search") {
        setLastSearchMs(res.durationMs ?? null);
        setFindResult({
          matches: res.matches as MatchRecord[],
          autoExpand: new Set(res.autoExpand),
          error: res.error,
        });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasData, pendingQuery, options.mode, options.caseSensitive, options.regex]);

  // ─── Auto-expand first match on new results ────────────────────────────────
  // KEY CHANGE: we only expand the FIRST match's ancestors (a tiny Set of 2-5
  // paths), not findResult.autoExpand which can be thousands of entries.
  // This makes setExpanded very cheap — mergeSets returns the same reference
  // when all ancestors are already expanded (the common case after a few chars).
  useEffect(() => {
    const matchesCount = findResult.matches.length;
    if (matchesCount > 0) {
      setActiveIndex(0);
      setScrollToId(findResult.matches[0].pathStr);
      const firstAncestors = new Set(getPathAncestors(findResult.matches[0].pathStr));
      setExpanded((prev) => mergeSets(prev, firstAncestors));
    } else {
      setActiveIndex(-1);
      setScrollToId(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findResult]);

  // ─── Expand active match ancestors on navigation ───────────────────────────
  useEffect(() => {
    if (activeIndex >= 0 && findResult.matches[activeIndex]) {
      const activePath = findResult.matches[activeIndex].pathStr;
      setExpanded((prev) => mergeSets(prev, new Set(getPathAncestors(activePath))));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  // ─── Parse text ────────────────────────────────────────────────────────────
  const applyTextWorker = useCallback(
    async (text: string, origin?: { x: number; y: number }) => {
      const gen = ++parseGenRef.current;
      setProcessing(true);
      try {
        // Parse on main thread immediately (for flattenTree via useMemo)
        let parsed: JsonValue | null = null;
        try { parsed = JSON.parse(text.trim()) as JsonValue; }
        catch { /* worker will report the error */ }

        const res = await send({ type: "parse", text });
        if (gen !== parseGenRef.current) return;

        if (res.type === "parse") {
          if (res.error) { setParseError(res.error); setProcessing(false); return; }
          setHasData(true);
          setCommittedSize(res.sizeBytes);
          setStats(res.stats);
          setParseError(null);
          setJsonRoot(parsed);
          setExpanded(new Set(res.defaultExpanded));
          const blob = new Blob([text], { type: "application/json" });
          registerFileInDuckDB(blob, "sift_data.json").catch(console.error);
          setZapOrigin(origin);
          setZapTrigger((t) => t + 1);
        }
      } finally {
        if (gen === parseGenRef.current) setProcessing(false);
      }
    },
    [send]
  );

  // ─── Parse file ────────────────────────────────────────────────────────────
  const applyFileWorker = useCallback(
    async (file: File, origin?: { x: number; y: number }) => {
      const gen = ++parseGenRef.current;
      setProcessing(true);
      setParseError(null);
      try {
        // Read + parse on main thread in parallel with the worker parse
        const text = await file.text();
        let parsed: JsonValue | null = null;
        try { parsed = JSON.parse(text.trim()) as JsonValue; }
        catch { /* worker will report the error */ }

        const res = await send({ type: "parse", file });
        if (gen !== parseGenRef.current) return;

        if (res.type === "parse") {
          if (res.error) { setParseError(res.error); setProcessing(false); return; }
          setHasData(true);
          setCommittedSize(res.sizeBytes);
          setStats(res.stats);
          setParseError(null);
          setJsonRoot(parsed);
          setExpanded(new Set(res.defaultExpanded));
          registerFileInDuckDB(file, "sift_data.json").catch(console.error);
          setZapOrigin(origin);
          setZapTrigger((t) => t + 1);
        }
      } finally {
        if (gen === parseGenRef.current) setProcessing(false);
      }
    },
    [send]
  );

  // ─── Match map (memoised) ──────────────────────────────────────────────────
  const matchMap = useMemo(
    () => new Map(findResult.matches.map((m) => [m.pathStr, m] as const)),
    [findResult]
  );

  const activeId = activeIndex >= 0 ? findResult.matches[activeIndex]?.pathStr ?? null : null;

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleDraftChange = useCallback((text: string) => setDraftText(text), []);

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
    setJsonRoot(null);
    setCommittedSize(0);
    setStats(computeStats(null, 0));
    setParseError(null);
    setExpanded(new Set());
    setLastSearchMs(null);
    parseGenRef.current++;
  }, []);

  const handleFile = useCallback(
    (file: File) => {
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
      if (next.has(pathStr)) next.delete(pathStr); else next.add(pathStr);
      return next;
    });
  }, []);

  const copyPath = useCallback((pathStr: string) => {
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(pathStr).catch(() => {});
    setCopiedPath(pathStr);
    window.setTimeout(() => setCopiedPath((p) => (p === pathStr ? null : p)), 1400);
  }, []);

  const handleExpandAll = useCallback(() => {
    if (!hasData || !jsonRoot) return;
    setExpanded(allContainerPaths(jsonRoot));
  }, [hasData, jsonRoot]);

  const handleCollapseAll = useCallback(() => setExpanded(new Set()), []);
  const handleToggleEditor = useCallback(() => setEditorOpen((v) => !v), []);
  const handleScrollDone = useCallback(() => setScrollToId(null), []);

  return (
    <div className="min-h-screen bg-riverbed font-sans text-parchment">
      <LightningZap trigger={zapTrigger} originX={zapOrigin?.x} originY={zapOrigin?.y} />

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
            onQueryChange={handleQueryChange}
            options={options}
            onOptionsChange={setOptions}
            matchCount={findResult.matches.length}
            activeIndex={activeIndex}
            onNext={() => goToMatch(activeIndex + 1)}
            onPrev={() => goToMatch(activeIndex - 1)}
            error={findResult.error}
            searching={searching}
            lastSearchMs={lastSearchMs}
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
