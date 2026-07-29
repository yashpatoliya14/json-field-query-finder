import type {
  FindResult,
  JsonStats,
  JsonValue,
  MatchRecord,
  PathSegment,
  Range,
  SearchOptions,
} from "./types";

const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function isContainer(v: JsonValue): v is JsonValue[] | { [k: string]: JsonValue } {
  return v !== null && typeof v === "object";
}

export function valueTypeOf(v: JsonValue): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

export function formatPath(path: PathSegment[]): string {
  if (path.length === 0) return "$";
  let out = "$";
  for (const seg of path) {
    if (seg.isIndex) {
      out += `[${seg.key}]`;
    } else {
      const k = String(seg.key);
      out += IDENT_RE.test(k) ? `.${k}` : `[${JSON.stringify(k)}]`;
    }
  }
  return out;
}

export function shortPreview(v: JsonValue, max = 64): string {
  let text: string;
  if (v === null) text = "null";
  else if (Array.isArray(v)) text = `[ ${v.length} item${v.length === 1 ? "" : "s"} ]`;
  else if (typeof v === "object") {
    const n = Object.keys(v).length;
    text = `{ ${n} key${n === 1 ? "" : "s"} }`;
  } else if (typeof v === "string") text = `"${v}"`;
  else text = String(v);
  return text.length > max ? `${text.slice(0, max - 1)}\u2026` : text;
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

export function findMatches(
  root: JsonValue | null | undefined,
  rawQuery: string,
  opts: SearchOptions
): FindResult {
  const result: FindResult = { matches: [], autoExpand: new Set(), error: null };
  const query = rawQuery.trim();
  if (root === null || root === undefined || !query) return result;

  let stopped = false;

  function addAncestors(path: PathSegment[]) {
    result.autoExpand.add("$");
    for (let i = 1; i <= path.length; i++) {
      result.autoExpand.add(formatPath(path.slice(0, i)));
    }
  }

  function walk(value: JsonValue, path: PathSegment[]) {
    if (stopped || !isContainer(value)) return;
    const isArr = Array.isArray(value);
    const entries: [string | number, JsonValue][] = isArr
      ? (value as JsonValue[]).map((v, i) => [i, v] as [number, JsonValue])
      : Object.entries(value as Record<string, JsonValue>);

    for (const [k, v] of entries) {
      if (stopped) return;
      const seg: PathSegment = { key: k, isIndex: isArr };
      const newPath = [...path, seg];
      const matchedOn: MatchRecord["matchedOn"] = [];

      let keyRanges: Range[] = [];
      if (opts.mode !== "values") {
        const kr = getRanges(String(k), query, opts);
        if (kr === "error") {
          result.error = "That pattern isn't valid — check the regular expression.";
          stopped = true;
          return;
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
          return;
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

      if (container) walk(v, newPath);
    }
  }

  walk(root, []);
  return result;
}

export function computeStats(root: JsonValue | null | undefined, sizeBytes: number): JsonStats {
  const stats: JsonStats = { nodes: 0, leaves: 0, containers: 0, maxDepth: 0, sizeBytes };
  if (root === null || root === undefined) return stats;

  function walk(v: JsonValue, depth: number) {
    stats.nodes++;
    stats.maxDepth = Math.max(stats.maxDepth, depth);
    if (isContainer(v)) {
      stats.containers++;
      const children = Array.isArray(v) ? v : Object.values(v);
      children.forEach((child) => walk(child, depth + 1));
    } else {
      stats.leaves++;
    }
  }
  walk(root, 0);
  return stats;
}

export function allContainerPaths(root: JsonValue | null | undefined): Set<string> {
  const set = new Set<string>();
  if (root === null || root === undefined) return set;
  set.add("$");

  function walk(v: JsonValue, path: PathSegment[]) {
    if (!isContainer(v)) return;
    const isArr = Array.isArray(v);
    const entries: [string | number, JsonValue][] = isArr
      ? (v as JsonValue[]).map((val, i) => [i, val] as [number, JsonValue])
      : Object.entries(v as Record<string, JsonValue>);
    for (const [k, val] of entries) {
      const newPath = [...path, { key: k, isIndex: isArr }];
      if (isContainer(val)) {
        set.add(formatPath(newPath));
        walk(val, newPath);
      }
    }
  }
  walk(root, []);
  return set;
}

export function defaultExpanded(root: JsonValue | null | undefined, depthLimit = 1): Set<string> {
  const set = new Set<string>();
  if (root === null || root === undefined) return set;
  set.add("$");

  function walk(v: JsonValue, path: PathSegment[], depth: number) {
    if (!isContainer(v) || depth > depthLimit) return;
    const isArr = Array.isArray(v);
    const entries: [string | number, JsonValue][] = isArr
      ? (v as JsonValue[]).map((val, i) => [i, val] as [number, JsonValue])
      : Object.entries(v as Record<string, JsonValue>);
    for (const [k, val] of entries) {
      const newPath = [...path, { key: k, isIndex: isArr }];
      if (isContainer(val)) {
        set.add(formatPath(newPath));
        walk(val, newPath, depth + 1);
      }
    }
  }
  walk(root, [], 0);
  return set;
}
