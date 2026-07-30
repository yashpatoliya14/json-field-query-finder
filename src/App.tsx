import { useEffect, useMemo, useState } from "react";
import Header from "./components/Header";
import SourceControls from "./components/SourceControls";
import SearchControls from "./components/SearchControls";
import StatStrip from "./components/StatStrip";
import MatchLedger from "./components/MatchLedger";
import TreePanel from "./components/TreePanel";
import { sampleJsonText } from "./lib/sampleData";
import {
  allContainerPaths,
  computeStats,
  defaultExpanded,
  findMatches,
} from "./lib/jsonTools";
import type { JsonValue, SearchOptions } from "./lib/types";

function parseJson(text: string): { value: JsonValue | null; error: string | null } {
  const trimmed = text.trim();
  if (!trimmed) return { value: null, error: null };
  try {
    return { value: JSON.parse(trimmed) as JsonValue, error: null };
  } catch (e) {
    return { value: undefined as unknown as JsonValue, error: (e as Error).message };
  }
}

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
  const [draftText, setDraftText] = useState(sampleJsonText);
  const [committedText, setCommittedText] = useState(sampleJsonText);
  const [committed, setCommitted] = useState<JsonValue | null>(() => JSON.parse(sampleJsonText));
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

  function applyText(text: string) {
    const { value, error } = parseJson(text);
    if (error) {
      setParseError(error);
      return;
    }
    setCommitted(value);
    setCommittedText(text);
    setParseError(null);
  }

  function handleDraftChange(text: string) {
    setDraftText(text);
  }

  function handleSample() {
    setDraftText(sampleJsonText);
    applyText(sampleJsonText);
  }

  function handleClear() {
    setDraftText("");
    applyText("");
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setDraftText(text);
      applyText(text);
      setEditorOpen(true);
    };
    reader.readAsText(file);
  }

  // Reset expansion + selection whenever a new document is committed.
  useEffect(() => {
    setExpanded(defaultExpanded(committed));
  }, [committed]);

  const findResult = useMemo(
    () => findMatches(committed, query, options),
    [committed, query, options.mode, options.caseSensitive, options.regex]
  );

  const matchMap = useMemo(() => {
    const map = new Map(findResult.matches.map((m) => [m.pathStr, m] as const));
    return map;
  }, [findResult]);

  const stats = useMemo(() => computeStats(committed, byteSize(committedText)), [committed, committedText]);

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
    if (!pendingScroll) return;
    const el = document.getElementById(pendingScroll);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setPendingScroll(null);
    }
  }, [expanded, pendingScroll]);

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
      <Header nodeCount={stats.nodes} matchCount={findResult.matches.length} hasQuery={query.trim().length > 0} />

      <main className="mx-auto flex max-w-[1400px] flex-col gap-4 px-5 py-5 sm:px-8 lg:h-[calc(100vh-77px)] lg:flex-row">
        <aside className="flex w-full flex-col gap-3 lg:h-full lg:w-[360px] lg:shrink-0 lg:overflow-hidden">
          <SourceControls
            editorOpen={editorOpen}
            onToggleEditor={() => setEditorOpen((v) => !v)}
            draftText={draftText}
            onDraftChange={handleDraftChange}
            onApply={() => applyText(draftText)}
            onSample={handleSample}
            onClear={handleClear}
            onFile={handleFile}
            parseError={parseError}
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
              matches={findResult.matches}
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
            root={committed}
            expanded={expanded}
            onToggle={toggleExpand}
            onExpandAll={() => setExpanded(allContainerPaths(committed))}
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
