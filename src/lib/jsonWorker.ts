/**
 * Web Worker: all heavy JSON work runs here — parse, stats, find.
 * Holds the parsed JSON in worker memory.
 * Builds the flat nodes index for DuckDB-Wasm indexing.
 */

import type { JsonValue } from "./types";
import { computeStats, defaultExpanded, appendPathSegment } from "./jsonTools";
import { flattenTree } from "./flattenTree";

let storedJson: JsonValue | null = null;
let storedSizeBytes = 0;

export type WorkerRequest =
  | { id: number; type: "parse"; text?: string; file?: File | Blob }
  | { id: number; type: "expandAll" }
  | { id: number; type: "defaultExpand" }
  | { id: number; type: "flatten"; expandedPaths: string[] };

export type WorkerSend =
  | { type: "parse"; text?: string; file?: File | Blob }
  | { type: "expandAll" }
  | { type: "defaultExpand" }
  | { type: "flatten"; expandedPaths: string[] };

export type WorkerResponse =
  | {
      id: number;
      type: "parse";
      sizeBytes: number;
      stats: ReturnType<typeof computeStats>;
      defaultExpanded: string[];
      flatNodes: any[];
      error: string | null;
    }
  | { id: number; type: "expandAll"; paths: string[] }
  | { id: number; type: "defaultExpand"; paths: string[] }
  | { id: number; type: "flatten"; flatRows: any[] }
  | { id: number; type: "error"; message: string };

function buildFlatNodes(value: JsonValue): any[] {
  const list: any[] = [];

  function walk(val: JsonValue, pathStr: string, key: string | number | null, isIndex: boolean) {
    if (val === null || typeof val !== "object") {
      list.push({
        pathStr,
        key: key !== null ? String(key) : "",
        value: val === null ? "null" : String(val),
        valueType: val === null ? "null" : typeof val,
        isIndex: isIndex ? 1 : 0
      });
      return;
    }
    if (Array.isArray(val)) {
      const len = val.length;
      for (let i = 0; i < len; i++) {
        walk(val[i], `${pathStr}[${i}]`, i, true);
      }
    } else {
      const keys = Object.keys(val);
      const len = keys.length;
      for (let i = 0; i < len; i++) {
        const k = keys[i];
        walk(val[k], appendPathSegment(pathStr, k, false), k, false);
      }
    }
  }

  walk(value, "$", null, false);
  return list;
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;

  try {
    if (req.type === "parse") {
      const { id, text, file } = req;
      let rawText = "";
      let sizeBytes = 0;

      if (file) {
        rawText = await file.text();
        sizeBytes = file.size;
      } else if (text !== undefined) {
        rawText = text;
        sizeBytes = new Blob([text]).size;
      }

      const trimmed = rawText.trim();

      if (!trimmed) {
        storedJson = null;
        storedSizeBytes = 0;
        const empty = computeStats(null, 0);
        const resp: WorkerResponse = {
          id,
          type: "parse",
          sizeBytes: 0,
          stats: empty,
          defaultExpanded: [],
          flatNodes: [],
          error: null,
        };
        self.postMessage(resp);
        return;
      }

      try {
        storedJson = JSON.parse(trimmed) as JsonValue;
        storedSizeBytes = sizeBytes;
      } catch (err) {
        storedJson = null;
        storedSizeBytes = 0;
        const resp: WorkerResponse = {
          id,
          type: "parse",
          sizeBytes: 0,
          stats: computeStats(null, 0),
          defaultExpanded: [],
          flatNodes: [],
          error: (err as Error).message,
        };
        self.postMessage(resp);
        return;
      }

      const stats = computeStats(storedJson, storedSizeBytes);
      const expanded = [...defaultExpanded(storedJson)];
      const flatNodes = buildFlatNodes(storedJson);

      const resp: WorkerResponse = {
        id,
        type: "parse",
        sizeBytes: storedSizeBytes,
        stats,
        defaultExpanded: expanded,
        flatNodes,
        error: null,
      };
      self.postMessage(resp);
      return;
    }

    if (req.type === "expandAll") {
      const { id } = req;
      const paths = [...allContainerPaths(storedJson)];
      const resp: WorkerResponse = { id, type: "expandAll", paths };
      self.postMessage(resp);
      return;
    }

    if (req.type === "defaultExpand") {
      const { id } = req;
      const paths = [...defaultExpanded(storedJson)];
      const resp: WorkerResponse = { id, type: "defaultExpand", paths };
      self.postMessage(resp);
      return;
    }

    if (req.type === "flatten") {
      const { id, expandedPaths } = req;
      const expandedSet = new Set(expandedPaths);
      const flatRows = flattenTree(storedJson, expandedSet);
      const resp: WorkerResponse = { id, type: "flatten", flatRows };
      self.postMessage(resp);
      return;
    }
  } catch (err) {
    const resp: WorkerResponse = {
      id: (req as { id: number }).id,
      type: "error",
      message: String(err),
    };
    self.postMessage(resp);
  }
};
