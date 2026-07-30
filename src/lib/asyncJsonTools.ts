import { formatPath, isContainer, valueTypeOf } from "./jsonTools";
import { yieldToMain } from "./scheduler";
import type {
  FindResult,
  JsonStats,
  JsonValue,
  MatchRecord,
  PathSegment,
  Range,
  SearchOptions,
} from "./types";

const NODES_PER_CHUNK = 800;

let parseWorker: Worker | null = null;

function getParseWorker(): Worker {
  if (!parseWorker) {
    parseWorker = new Worker(new URL("./jsonParseWorker.ts", import.meta.url), { type: "module" });
  }
  return parseWorker;
}

export function parseJsonAsync(
  text: string
): Promise<{ value: JsonValue | null; error: string | null }> {
  return new Promise((resolve) => {
    const worker = getParseWorker();
    const onMessage = (event: MessageEvent<{ ok: boolean; value?: JsonValue | null; error?: string }>) => {
      worker.removeEventListener("message", onMessage);
      const data = event.data;
      if (data.ok) {
        resolve({ value: data.value ?? null, error: null });
      } else {
        resolve({ value: null, error: data.error ?? "Invalid JSON" });
      }
    };
    worker.addEventListener("message", onMessage);
    worker.postMessage(text);
  });
}

function getRanges(haystack: string, query: string, opts: SearchOptions): Range[] | "error" {
  if (!query) return [];
  if (opts.regex) {
    let re: RegExp;
    try {
      re = new RegExp(query, opts.caseSensitive ? "g" : "gi");
    } catch {
      return "error";
    }
    const ranges: Range[] = [];
    let guard = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(haystack)) && guard < 2000) {
      guard++;
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      ranges.push([m.index, m.index + m[0].length]);
    }
    return ranges;
  }
  const hay = opts.caseSensitive ? haystack : haystack.toLowerCase();
  const q = opts.caseSensitive ? query : query.toLowerCase();
  const ranges: Range[] = [];
  let idx = 0;
  while (true) {
    const found = hay.indexOf(q, idx);
    if (found === -1) break;
    ranges.push([found, found + q.length]);
    idx = found + q.length;
  }
  return ranges;
}

interface StackFrame {
  value: JsonValue;
  depth: number;
  phase: "enter" | "exit";
}

export async function computeStatsAsync(
  root: JsonValue | null | undefined,
  sizeBytes: number
): Promise<JsonStats> {
  const stats: JsonStats = { nodes: 0, leaves: 0, containers: 0, maxDepth: 0, sizeBytes };
  if (root === null || root === undefined) return stats;

  const stack: StackFrame[] = [{ value: root, depth: 0, phase: "enter" }];
  let budget = NODES_PER_CHUNK;

  while (stack.length > 0) {
    const frame = stack.pop()!;
    if (frame.phase === "exit") continue;

    stats.nodes++;
    stats.maxDepth = Math.max(stats.maxDepth, frame.depth);

    if (isContainer(frame.value)) {
      stats.containers++;
      stack.push({ value: frame.value, depth: frame.depth, phase: "exit" });
      const children = Array.isArray(frame.value) ? frame.value : Object.values(frame.value);
      for (let i = children.length - 1; i >= 0; i--) {
        stack.push({ value: children[i], depth: frame.depth + 1, phase: "enter" });
      }
    } else {
      stats.leaves++;
    }

    budget--;
    if (budget <= 0) {
      budget = NODES_PER_CHUNK;
      await yieldToMain();
    }
  }

  return stats;
}

interface WalkFrame {
  value: JsonValue;
  path: PathSegment[];
}

export async function findMatchesAsync(
  root: JsonValue | null | undefined,
  rawQuery: string,
  opts: SearchOptions
): Promise<FindResult> {
  const result: FindResult = { matches: [], autoExpand: new Set(), error: null };
  const query = rawQuery.trim();
  if (root === null || root === undefined || !query) return result;

  let stopped = false;
  let budget = NODES_PER_CHUNK;

  function addAncestors(path: PathSegment[]) {
    result.autoExpand.add("$");
    for (let i = 1; i <= path.length; i++) {
      result.autoExpand.add(formatPath(path.slice(0, i)));
    }
  }

  const stack: WalkFrame[] = [{ value: root, path: [] }];

  while (stack.length > 0 && !stopped) {
    const { value, path } = stack.pop()!;
    if (!isContainer(value)) continue;

    const isArr = Array.isArray(value);
    const entries: [string | number, JsonValue][] = isArr
      ? (value as JsonValue[]).map((v, i) => [i, v] as [number, JsonValue])
      : Object.entries(value as Record<string, JsonValue>);

    for (let i = entries.length - 1; i >= 0; i--) {
      const [k, v] = entries[i];
      if (isContainer(v)) {
        stack.push({
          value: v,
          path: [...path, { key: k, isIndex: isArr }],
        });
      }
    }

    for (const [k, v] of entries) {
      if (stopped) break;

      const seg: PathSegment = { key: k, isIndex: isArr };
      const newPath = [...path, seg];
      const matchedOn: MatchRecord["matchedOn"] = [];

      let keyRanges: Range[] = [];
      if (opts.mode !== "values") {
        const kr = getRanges(String(k), query, opts);
        if (kr === "error") {
          result.error = "That pattern isn't valid — check the regular expression.";
          stopped = true;
          break;
        }
        keyRanges = kr;
        if (kr.length) matchedOn.push("key");
      }

      let valueRanges: Range[] = [];
      const container = isContainer(v);
      if (!container && opts.mode !== "keys") {
        const text = v === null ? "null" : String(v);
        const vr = getRanges(text, query, opts);
        if (vr === "error") {
          result.error = "That pattern isn't valid — check the regular expression.";
          stopped = true;
          break;
        }
        valueRanges = vr;
        if (vr.length) matchedOn.push("value");
      }

      if (matchedOn.length) {
        result.matches.push({
          pathStr: formatPath(newPath),
          path: newPath,
          key: k,
          isIndex: isArr,
          value: v,
          valueType: valueTypeOf(v),
          matchedOn,
          keyRanges,
          valueRanges,
        });
        addAncestors(newPath);
      }

      budget--;
      if (budget <= 0) {
        budget = NODES_PER_CHUNK;
        await yieldToMain();
      }
    }
  }

  return result;
}

export { yieldToMain };
