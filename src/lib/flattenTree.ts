import type { JsonValue, PathSegment } from "./types";
import { appendPathSegment, isContainer } from "./jsonTools";

export interface FlatRow {
  /** Unique row id (path string) */
  id: string;
  /** JSON key/index of this node in its parent */
  nodeKey: string | number | null;
  /** Whether this is an array index */
  isIndex: boolean;
  /** The JSON value at this node */
  value: JsonValue;
  /** Full path segments */
  path: PathSegment[];
  /** Indentation depth */
  depth: number;
  /** Whether this is the last sibling */
  isLast: boolean;
  /** 'leaf' | 'open' | 'closed' | 'empty' */
  kind: "leaf" | "open" | "closed" | "empty";
  /** For containers: open/close brace character */
  openBrace?: string;
  closeBrace?: string;
  /** Number of entries (for containers) */
  entryCount?: number;
  /** Is array */
  isArr?: boolean;
}

/** A closing brace row */
export interface ClosingRow {
  id: string;
  kind: "closing";
  depth: number;
  closeBrace: string;
  isLast: boolean;
}

export type VirtualRow = FlatRow | ClosingRow;

/**
 * Flatten the JSON tree into a list of rows that should be visible,
 * based on the current `expanded` set.
 *
 * This runs once per render (memoised), and feeds the virtualised list.
 */
export function flattenTree(
  root: JsonValue | null | undefined,
  expanded: Set<string>,
  maxRows = 50000
): VirtualRow[] {
  if (root === null || root === undefined) return [];

  const rows: VirtualRow[] = [];

  function walk(
    nodeKey: string | number | null,
    isIndex: boolean,
    value: JsonValue,
    path: PathSegment[],
    pathStr: string,
    depth: number,
    isLast: boolean
  ) {
    if (rows.length >= maxRows) return;

    const container = isContainer(value);

    if (!container) {
      rows.push({
        id: pathStr,
        nodeKey,
        isIndex,
        value,
        path,
        depth,
        isLast,
        kind: "leaf",
      });
      return;
    }

    const isArr = Array.isArray(value);
    const openBrace = isArr ? "[" : "{";
    const closeBrace = isArr ? "]" : "}";

    let entryCount = 0;
    if (isArr) {
      entryCount = (value as JsonValue[]).length;
    } else {
      entryCount = Object.keys(value as Record<string, JsonValue>).length;
    }

    if (entryCount === 0) {
      rows.push({
        id: pathStr,
        nodeKey,
        isIndex,
        value,
        path,
        depth,
        isLast,
        kind: "empty",
        openBrace,
        closeBrace,
        entryCount: 0,
        isArr,
      });
      return;
    }

    const isOpen = expanded.has(pathStr);

    rows.push({
      id: pathStr,
      nodeKey,
      isIndex,
      value,
      path,
      depth,
      isLast,
      kind: isOpen ? "open" : "closed",
      openBrace,
      closeBrace,
      entryCount,
      isArr,
    });

    if (isOpen) {
      if (isArr) {
        const arr = value as JsonValue[];
        for (let i = 0; i < entryCount; i++) {
          if (rows.length >= maxRows) break;
          const v = arr[i];
          const seg: PathSegment = { key: i, isIndex: true };
          const childPathStr = `${pathStr}[${i}]`;
          walk(i, true, v, [...path, seg], childPathStr, depth + 1, i === entryCount - 1);
        }
      } else {
        const obj = value as Record<string, JsonValue>;
        const keys = Object.keys(obj);
        for (let i = 0; i < entryCount; i++) {
          if (rows.length >= maxRows) break;
          const k = keys[i];
          const v = obj[k];
          const seg: PathSegment = { key: k, isIndex: false };
          const childPathStr = appendPathSegment(pathStr, k, false);
          walk(k, false, v, [...path, seg], childPathStr, depth + 1, i === entryCount - 1);
        }
      }

      // Closing brace row
      if (rows.length < maxRows) {
        rows.push({
          id: `${pathStr}/__close`,
          kind: "closing",
          depth,
          closeBrace,
          isLast,
        });
      }
    }
  }

  walk(null, false, root, [], "$", 0, true);
  return rows;
}
