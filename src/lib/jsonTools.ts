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


export function appendPathSegment(basePathStr: string, key: string | number, isIndex: boolean): string {
  if (!basePathStr) return "$";
  if (isIndex) return `${basePathStr}[${key}]`;
  const k = String(key);
  return IDENT_RE.test(k) ? `${basePathStr}.${k}` : `${basePathStr}[${JSON.stringify(k)}]`;
}

export function formatPath(path: PathSegment[]): string {
  if (path.length === 0) return "$";
  let out = "$";
  for (let i = 0; i < path.length; i++) {
    out = appendPathSegment(out, path[i].key, path[i].isIndex);
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

function getRanges(
  haystack: string,
  query: string,
  opts: SearchOptions,
  compiledRe: RegExp | null
): Range[] | "error" {
  if (!query) return [];
  if (opts.regex) {
    if (!compiledRe) return "error";
    compiledRe.lastIndex = 0; // reset state
    const ranges: Range[] = [];
    let guard = 0;
    let m: RegExpExecArray | null;
    while ((m = compiledRe.exec(haystack)) && guard < 2000) {
      guard++;
      if (m[0].length === 0) {
        compiledRe.lastIndex++;
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
  const MAX_MATCHES = 10000;

  // Compile the RegExp once per search, instead of inside every getRanges call!
  let compiledRe: RegExp | null = null;
  if (opts.regex) {
    try {
      compiledRe = new RegExp(query, opts.caseSensitive ? "g" : "gi");
    } catch {
      result.error = "That pattern isn't valid — check the regular expression.";
      return result;
    }
  }

  function walk(value: JsonValue, path: PathSegment[], pathStr: string, ancestorPathStrs: string[]) {
    if (stopped || !isContainer(value)) return;
    if (result.matches.length >= MAX_MATCHES) {
      result.error = `Showing first ${MAX_MATCHES.toLocaleString()} matches. Refine your query for more.`;
      stopped = true;
      return;
    }

    const isArr = Array.isArray(value);

    if (isArr) {
      const arr = value as JsonValue[];
      const len = arr.length;
      for (let i = 0; i < len; i++) {
        if (stopped) return;
        const v = arr[i];
        const seg: PathSegment = { key: i, isIndex: true };
        const newPath = [...path, seg];
        const newPathStr = `${pathStr}[${i}]`;
        const currentAncestors = [...ancestorPathStrs, pathStr];
        const matchedOn: MatchRecord["matchedOn"] = [];

        let keyRanges: Range[] = [];
        if (opts.mode !== "values") {
          const kr = getRanges(String(i), query, opts, compiledRe);
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
          const vr = getRanges(text, query, opts, compiledRe);
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
            pathStr: newPathStr,
            path: newPath,
            key: i,
            isIndex: true,
            value: v,
            valueType: valueTypeOf(v),
            matchedOn,
            keyRanges,
            valueRanges,
          });
          for (let a = 0; a < currentAncestors.length; a++) {
            result.autoExpand.add(currentAncestors[a]);
          }
        }

        if (container) walk(v, newPath, newPathStr, currentAncestors);
      }
    } else {
      const obj = value as Record<string, JsonValue>;
      const keys = Object.keys(obj);
      const len = keys.length;
      for (let i = 0; i < len; i++) {
        if (stopped) return;
        const k = keys[i];
        const v = obj[k];
        const seg: PathSegment = { key: k, isIndex: false };
        const newPath = [...path, seg];
        const newPathStr = appendPathSegment(pathStr, k, false);
        const currentAncestors = [...ancestorPathStrs, pathStr];
        const matchedOn: MatchRecord["matchedOn"] = [];

        let keyRanges: Range[] = [];
        if (opts.mode !== "values") {
          const kr = getRanges(k, query, opts, compiledRe);
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
          const vr = getRanges(text, query, opts, compiledRe);
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
            pathStr: newPathStr,
            path: newPath,
            key: k,
            isIndex: false,
            value: v,
            valueType: valueTypeOf(v),
            matchedOn,
            keyRanges,
            valueRanges,
          });
          for (let a = 0; a < currentAncestors.length; a++) {
            result.autoExpand.add(currentAncestors[a]);
          }
        }

        if (container) walk(v, newPath, newPathStr, currentAncestors);
      }
    }
  }

  walk(root, [], "$", []);
  return result;
}

export function computeStats(root: JsonValue | null | undefined, sizeBytes: number): JsonStats {
  const stats: JsonStats = { nodes: 0, leaves: 0, containers: 0, maxDepth: 0, sizeBytes };
  if (root === null || root === undefined) return stats;

  function walk(v: JsonValue, depth: number) {
    stats.nodes++;
    if (depth > stats.maxDepth) stats.maxDepth = depth;
    if (isContainer(v)) {
      stats.containers++;
      if (Array.isArray(v)) {
        const len = v.length;
        for (let i = 0; i < len; i++) {
          walk(v[i], depth + 1);
        }
      } else {
        const keys = Object.keys(v);
        const len = keys.length;
        for (let i = 0; i < len; i++) {
          walk(v[keys[i]], depth + 1);
        }
      }
    } else {
      stats.leaves++;
    }
  }
  walk(root, 0);
  return stats;
}

export function allContainerPaths(root: JsonValue | null | undefined, maxCount = 20000): Set<string> {
  const set = new Set<string>();
  if (root === null || root === undefined) return set;
  set.add("$");

  let count = 1;

  function walk(v: JsonValue, pathStr: string) {
    if (!isContainer(v) || count >= maxCount) return;

    if (Array.isArray(v)) {
      const len = v.length;
      for (let i = 0; i < len; i++) {
        if (count >= maxCount) return;
        const val = v[i];
        if (isContainer(val)) {
          const childPathStr = `${pathStr}[${i}]`;
          set.add(childPathStr);
          count++;
          walk(val, childPathStr);
        }
      }
    } else {
      const keys = Object.keys(v);
      const len = keys.length;
      for (let i = 0; i < len; i++) {
        if (count >= maxCount) return;
        const k = keys[i];
        const val = v[k];
        if (isContainer(val)) {
          const childPathStr = appendPathSegment(pathStr, k, false);
          set.add(childPathStr);
          count++;
          walk(val, childPathStr);
        }
      }
    }
  }
  walk(root, "$");
  return set;
}

export function defaultExpanded(root: JsonValue | null | undefined, depthLimit = 1, maxCount = 100): Set<string> {
  const set = new Set<string>();
  if (root === null || root === undefined) return set;
  set.add("$");

  let count = 1;

  function walk(v: JsonValue, pathStr: string, depth: number) {
    if (!isContainer(v) || depth > depthLimit || count >= maxCount) return;

    if (Array.isArray(v)) {
      const len = v.length;
      for (let i = 0; i < len; i++) {
        if (count >= maxCount) return;
        const val = v[i];
        if (isContainer(val)) {
          const childPathStr = `${pathStr}[${i}]`;
          set.add(childPathStr);
          count++;
          walk(val, childPathStr, depth + 1);
        }
      }
    } else {
      const keys = Object.keys(v);
      const len = keys.length;
      for (let i = 0; i < len; i++) {
        if (count >= maxCount) return;
        const k = keys[i];
        const val = v[k];
        if (isContainer(val)) {
          const childPathStr = appendPathSegment(pathStr, k, false);
          set.add(childPathStr);
          count++;
          walk(val, childPathStr, depth + 1);
        }
      }
    }
  }

  walk(root, "$", 0);
  return set;
}
