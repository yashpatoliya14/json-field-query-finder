/**
 * Web Worker: all heavy JSON work runs here — parse, stats, find.
 * Messages in → results out, main thread stays buttery smooth.
 * Holds the parsed JSON in worker memory to avoid main thread serialization.
 */

import type { JsonValue, SearchOptions } from "./types";
import { computeStats, findMatches, defaultExpanded, allContainerPaths } from "./jsonTools";
import { flattenTree } from "./flattenTree";

let storedJson: JsonValue | null = null;
let storedSizeBytes = 0;

export type WorkerRequest =
  | { id: number; type: "parse"; text?: string; file?: File | Blob }
  | { id: number; type: "search"; query: string; options: SearchOptions }
  | { id: number; type: "expandAll" }
  | { id: number; type: "defaultExpand" }
  | { id: number; type: "flatten"; expandedPaths: string[] };

/** WorkerSend — same as WorkerRequest but without the id (added by the hook) */
export type WorkerSend =
  | { type: "parse"; text?: string; file?: File | Blob }
  | { type: "search"; query: string; options: SearchOptions }
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
      error: string | null;
    }
  | {
      id: number;
      type: "search";
      matches: ReturnType<typeof findMatches>["matches"];
      autoExpand: string[];
      error: string | null;
    }
  | { id: number; type: "expandAll"; paths: string[] }
  | { id: number; type: "defaultExpand"; paths: string[] }
  | { id: number; type: "flatten"; flatRows: any[] }
  | { id: number; type: "error"; message: string };

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;

  try {
    if (req.type === "parse") {
      const { id, text, file } = req;
      let rawText = "";
      let sizeBytes = 0;

      if (file) {
        // Blazing fast binary read inside worker thread
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
          error: (err as Error).message,
        };
        self.postMessage(resp);
        return;
      }

      const stats = computeStats(storedJson, storedSizeBytes);
      const expanded = [...defaultExpanded(storedJson)];

      const resp: WorkerResponse = {
        id,
        type: "parse",
        sizeBytes: storedSizeBytes,
        stats,
        defaultExpanded: expanded,
        error: null,
      };
      self.postMessage(resp);
      return;
    }

    if (req.type === "search") {
      const { id, query, options } = req;
      const result = findMatches(storedJson, query, options);
      const resp: WorkerResponse = {
        id,
        type: "search",
        matches: result.matches,
        autoExpand: [...result.autoExpand],
        error: result.error,
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
