import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Header from "./components/Header";
import LoadingOverlay from "./components/LoadingOverlay";
import SourceControls, { type SourceControlsHandle } from "./components/SourceControls";
import SearchControls from "./components/SearchControls";
import StatStrip from "./components/StatStrip";
import MatchLedger from "./components/MatchLedger";
import TreePanel from "./components/TreePanel";
import { useLoadProgress } from "./hooks/useLoadProgress";
import { useDebouncedValue } from "./hooks/useDebouncedValue";
import { sampleJsonText } from "./lib/sampleData";
import { computeStatsAsync, findMatchesAsync, parseJsonAsync } from "./lib/asyncJsonTools";
import { allContainerPaths, defaultExpanded } from "./lib/jsonTools";
import { yieldToMain } from "./lib/scheduler";
import type { FindResult, JsonStats, JsonValue, SearchOptions } from "./lib/types";

const EMPTY_STATS: JsonStats = { nodes: 0, leaves: 0, containers: 0, maxDepth: 0, sizeBytes: 0 };
const EMPTY_FIND: FindResult = { matches: [], autoExpand: new Set(), error: null };
const MATCH_LEDGER_LIMIT = 400;

function byteSize(text: string): number {
  return new TextEncoder().encode(text).length;
}

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
  const sourceRef = useRef<SourceControlsHandle>(null);
  const applyGenRef = useRef(0);
  const load = useLoadProgress();
  const [, startTransition] = useTransition();

  const [committedText, setCommittedText] = useState(sampleJsonText);
  const [committed, setCommitted] = useState<JsonValue | null>(() => JSON.parse(sampleJsonText));
  const [displayRoot, setDisplayRoot] = useState<JsonValue | null>(() => JSON.parse(sampleJsonText));
  const [parseError, setParseError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const [expanded, setExpanded] = useState<Set<string>>(() => defaultExpanded(committed));
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<SearchOptions>({
    mode: "both",
    caseSensitive: false,
    regex: false,
  });
  const [activeIndex, setActiveIndex] = useState(-1);
  const [pendingScroll, setPendingScroll] = useState<string | null>(null);

  const [stats, setStats] = useState<JsonStats>(() => ({
    ...EMPTY_STATS,
    sizeBytes: byteSize(sampleJsonText),
  }));
  const [findResult, setFindResult] = useState<FindResult>(EMPTY_FIND);
  const debouncedQuery = useDebouncedValue(query, 300);

  async function applyText(text: string) {
    const gen = ++applyGenRef.current;
    setParseError(null);
    load.begin("parsing");
    load.report(0, Math.max(text.length, 1));

    const { value, error } = await parseJsonAsync(text);
    if (gen !== applyGenRef.current) return;

    if (error) {
      setParseError(error);
      load.end();
      return;
    }

    load.report(text.length, text.length);
    await yieldToMain();

    startTransition(() => {
      setCommitted(value);
      setCommittedText(text);
      setExpanded(defaultExpanded(value));
    });

    await yieldToMain();
    await yieldToMain();
    if (gen !== applyGenRef.current) return;

    setDisplayRoot(value);
    load.end();
  }

  async function handleSample() {
    await sourceRef.current?.setText(sampleJsonText, (c, t) => load.report(c, t));
    await applyText(sampleJsonText);
  }

  function handleClear() {
    sourceRef.current?.clear();
    void applyText("");
  }

  async function handleFile(file: File) {
    setEditorOpen(true);
    load.begin("reading");
    const text = await readFileChunked(file, (c, t) => load.report(c, t));
    if (!text) {
      load.end();
      return;
    }
    await sourceRef.current?.setText(text, (c, t) => load.report(c, t));
    await applyText(text);
  }

  useEffect(() => {
    let cancelled = false;
    const sizeBytes = byteSize(committedText);

    if (committed === null || committed === undefined) {
      setStats({ ...EMPTY_STATS, sizeBytes });
      return;
    }

    void computeStatsAsync(committed, sizeBytes).then((next) => {
      if (!cancelled) setStats(next);
    });

    return () => {
      cancelled = true;
    };
  }, [committed, committedText]);

  useEffect(() => {
    let cancelled = false;
    const trimmed = debouncedQuery.trim();

    if (committed === null || committed === undefined || !trimmed) {
      setFindResult(EMPTY_FIND);
      return;
    }

    void findMatchesAsync(committed, debouncedQuery, options).then((next) => {
      if (!cancelled) setFindResult(next);
    });

    return () => {
      cancelled = true;
    };
  }, [committed, debouncedQuery, options.mode, options.caseSensitive, options.regex]);

  const matchMap = useMemo(
    () => new Map(findResult.matches.map((m) => [m.pathStr, m] as const)),
    [findResult.matches]
  );

  const visibleMatches = useMemo(
    () => (findResult.matches.length > MATCH_LEDGER_LIMIT ? findResult.matches.slice(0, MATCH_LEDGER_LIMIT) : findResult.matches),
    [findResult.matches]
  );

  useEffect(() => {
    if (findResult.matches.length) {
      setActiveIndex(0);
      setPendingScroll(findResult.matches[0].pathStr);
    } else {
      setActiveIndex(-1);
      setPendingScroll(null);
    }
    if (findResult.autoExpand.size) {
      setExpanded((prev) => mergeSets(prev, findResult.autoExpand));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findResult]);

  useEffect(() => {
    if (!pendingScroll || load.isLoading) return;
    const el = document.getElementById(pendingScroll);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setPendingScroll(null);
    }
  }, [expanded, pendingScroll, load.isLoading]);

  function goToMatch(idx: number) {
    const n = findResult.matches.length;
    if (!n) return;
    const clamped = ((idx % n) + n) % n;
    setActiveIndex(clamped);
    setPendingScroll(findResult.matches[clamped].pathStr);
  }

  function toggleExpand(pathStr: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(pathStr)) next.delete(pathStr);
      else next.add(pathStr);
      return next;
    });
  }

  async function handleExpandAll() {
    await yieldToMain();
    startTransition(() => setExpanded(allContainerPaths(committed)));
  }

  function copyPath(pathStr: string) {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(pathStr).catch(() => {});
    }
    setCopiedPath(pathStr);
    window.setTimeout(() => {
      setCopiedPath((p) => (p === pathStr ? null : p));
    }, 1400);
  }

  const activeId = activeIndex >= 0 ? findResult.matches[activeIndex]?.pathStr ?? null : null;

  return (
    <div className="min-h-screen bg-riverbed font-sans text-parchment">
      {load.progress && <LoadingOverlay progress={load.progress} />}

      <Header nodeCount={stats.nodes} matchCount={findResult.matches.length} hasQuery={query.trim().length > 0} />

      <main className="mx-auto flex max-w-[1400px] flex-col gap-4 px-5 py-5 sm:px-8 lg:h-[calc(100vh-77px)] lg:flex-row">
        <aside className="flex w-full flex-col gap-3 lg:h-full lg:w-[360px] lg:shrink-0 lg:overflow-hidden">
          <SourceControls
            ref={sourceRef}
            editorOpen={editorOpen}
            onToggleEditor={() => setEditorOpen((v) => !v)}
            initialText={sampleJsonText}
            onApply={(text) => void applyText(text)}
            onSample={() => void handleSample()}
            onClear={handleClear}
            onFile={(file) => void handleFile(file)}
            parseError={parseError}
            load={load}
            isLoading={load.isLoading}
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
          />

          <StatStrip stats={stats} />

          <div className="min-h-0 flex-1">
            <MatchLedger
              matches={visibleMatches}
              totalMatches={findResult.matches.length}
              activeIndex={activeIndex}
              onSelect={goToMatch}
              onCopyPath={copyPath}
              copiedPath={copiedPath}
              hasQuery={query.trim().length > 0}
            />
          </div>
        </aside>

        <section className="min-h-[480px] flex-1 lg:h-full">
          <TreePanel
            root={displayRoot}
            isLoading={load.isLoading}
            expanded={expanded}
            onToggle={toggleExpand}
            onExpandAll={() => void handleExpandAll()}
            onCollapseAll={() => setExpanded(new Set())}
            matchMap={matchMap}
            activeId={activeId}
            onCopyPath={copyPath}
            copiedPath={copiedPath}
          />
        </section>
      </main>

      <footer className="mx-auto max-w-[1400px] px-5 pb-6 pt-1 sm:px-8">
        <p className="font-sans text-[11px] text-sediment-dim">
          Sift runs entirely in your browser — nothing you paste ever leaves this tab.
        </p>
      </footer>
    </div>
  );
}

async function readFileChunked(
  file: File,
  onProgress: (completed: number, total: number) => void
): Promise<string> {
  const total = file.size;
  onProgress(0, total);

  const reader = file.stream().getReader();
  const decoder = new TextDecoder();
  let text = "";
  let read = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    read += value.byteLength;
    onProgress(read, total);
    await yieldToMain();
  }
  text += decoder.decode();
  onProgress(total, total);
  return text;
}
