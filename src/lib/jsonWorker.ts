/**
 * Web Worker: parse, stats, find — all heavy work here.
 *
 * DuckDB-Wasm lives INSIDE this worker so the main thread is never blocked.
 * Pipeline:
 *   parse  → JSON.parse → buildFlatNodes → bulk INSERT into DuckDB table
 *   search → SQL WHERE  → rows back     → main thread highlights only the hits
 *   flatten / expandAll / defaultExpand → pure-JS (no DB needed)
 */

import * as duckdb from "@duckdb/duckdb-wasm";
import type { JsonValue, SearchOptions } from "./types";
import { computeStats, defaultExpanded, appendPathSegment, allContainerPaths } from "./jsonTools";
import { flattenTree } from "./flattenTree";
import { buildSearchSql, mapDuckDbRowsToMatches } from "./mongoSearch";

// ─── Worker-local state ──────────────────────────────────────────────────────

let storedJson: JsonValue | null = null;
let storedSizeBytes = 0;

// DuckDB state — lazily initialised once, then reused
let db: duckdb.AsyncDuckDB | null = null;
let conn: duckdb.AsyncDuckDBConnection | null = null;
let dbReady = false;
let dbInitialising = false;
let dbWaiters: Array<{ resolve: () => void; reject: (e: unknown) => void }> = [];

// Tracks the in-flight indexInDuckDB() promise so search can await it.
// Reset to null once indexing completes so repeated parses work correctly.
let indexingPromise: Promise<void> | null = null;

// ─── Types ───────────────────────────────────────────────────────────────────

export type WorkerRequest =
  | { id: number; type: "parse"; text?: string; file?: File | Blob }
  | { id: number; type: "search"; query: string; options: SearchOptions }
  | { id: number; type: "expandAll" }
  | { id: number; type: "defaultExpand" }
  | { id: number; type: "flatten"; expandedPaths: string[] };

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
      flatNodes: any[];
      error: string | null;
    }
  | {
      id: number;
      type: "search";
      matches: any[];
      autoExpand: string[];
      error: string | null;
      durationMs: number;
    }
  | { id: number; type: "expandAll"; paths: string[] }
  | { id: number; type: "defaultExpand"; paths: string[] }
  | { id: number; type: "flatten"; flatRows: any[] }
  | { id: number; type: "error"; message: string };

// ─── DuckDB bootstrap ────────────────────────────────────────────────────────

async function ensureDB(): Promise<void> {
  if (dbReady) return;
  if (dbInitialising) {
    return new Promise((resolve, reject) => dbWaiters.push({ resolve, reject }));
  }
  dbInitialising = true;

  let initError: unknown = null;
  try {
    // Workers are blocked from loading cross-origin scripts under COEP.
    // Use same-origin assets copied to /public/duckdb/ instead of jsDelivr.
    const LOCAL_BUNDLES: duckdb.DuckDBBundles = {
      mvp: {
        mainModule: "/duckdb/duckdb-mvp.wasm",
        mainWorker: "/duckdb/duckdb-browser-mvp.worker.js",
      },
      eh: {
        mainModule: "/duckdb/duckdb-eh.wasm",
        mainWorker: "/duckdb/duckdb-browser-eh.worker.js",
      },
    };
    const bundle = await duckdb.selectBundle(LOCAL_BUNDLES);

    const worker = new Worker(bundle.mainWorker!);
    const logger = new duckdb.VoidLogger();
    db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    conn = await db.connect();

    // Base table — DROP+CREATE happens inside indexInDuckDB on each new JSON load
    await conn.query(`
      CREATE TABLE IF NOT EXISTS nodes (
        pathStr   VARCHAR NOT NULL,
        key       VARCHAR NOT NULL,
        value     VARCHAR NOT NULL,
        valueType VARCHAR NOT NULL,
        isIndex   TINYINT NOT NULL
      );
    `);

    dbReady = true;
  } catch (err) {
    initError = err;
    throw err;
  } finally {
    dbInitialising = false;
    const waiters = dbWaiters.splice(0);
    if (initError) {
      waiters.forEach((w) => w.reject(initError));
    } else {
      waiters.forEach((w) => w.resolve());
    }
  }
}

// ─── Flat node builder ────────────────────────────────────────────────────────

interface FlatNode {
  pathStr: string;
  key: string;
  value: string;
  valueType: string;
  isIndex: number; // 0 | 1
}

function buildFlatNodes(root: JsonValue): FlatNode[] {
  const list: FlatNode[] = [];

  function walk(val: JsonValue, pathStr: string, key: string | number | null, isIndex: boolean) {
    if (val === null || typeof val !== "object") {
      list.push({
        pathStr,
        key: key !== null ? String(key) : "",
        value: val === null ? "null" : String(val),
        valueType: val === null ? "null" : typeof val,
        isIndex: isIndex ? 1 : 0,
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

  walk(root, "$", null, false);
  return list;
}

// ─── Bulk insert into DuckDB ──────────────────────────────────────────────────
// We build a NDJSON buffer and use insertJSONStreamBuffer which is the fastest
// path DuckDB-Wasm exposes (Arrow internally, no row-by-row overhead).

async function indexInDuckDB(nodes: FlatNode[]): Promise<void> {
  if (!conn) throw new Error("DuckDB not initialised");

  // Drop + recreate so we never have stale rows from a previous load
  await conn.query("DROP TABLE IF EXISTS nodes;");
  await conn.query(`
    CREATE TABLE nodes (
      pathStr   VARCHAR NOT NULL,
      key       VARCHAR NOT NULL,
      value     VARCHAR NOT NULL,
      valueType VARCHAR NOT NULL,
      isIndex   TINYINT NOT NULL
    );
  `);

  if (nodes.length === 0) return;

  // Build NDJSON: one JSON object per line, no trailing newline needed
  // Chunk in 50 k rows to avoid single giant string allocation
  const CHUNK = 50_000;
  for (let start = 0; start < nodes.length; start += CHUNK) {
    const end = Math.min(start + CHUNK, nodes.length);
    const lines: string[] = new Array(end - start);
    for (let i = start; i < end; i++) {
      const n = nodes[i];
      // Manual serialise — faster than JSON.stringify for known shape
      lines[i - start] =
        `{"pathStr":${JSON.stringify(n.pathStr)},"key":${JSON.stringify(n.key)}` +
        `,"value":${JSON.stringify(n.value)},"valueType":"${n.valueType}","isIndex":${n.isIndex}}`;
    }
    const ndjson = lines.join("\n");
    const buf = new TextEncoder().encode(ndjson);
    await db!.registerFileBuffer(`chunk_${start}.ndjson`, buf);
    await conn.query(
      `INSERT INTO nodes SELECT * FROM read_json('chunk_${start}.ndjson', format='newline_delimited');`
    );
    await db!.dropFile(`chunk_${start}.ndjson`);
  }
}

// ─── Message handler ──────────────────────────────────────────────────────────

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;

  try {
    // ── PARSE ──────────────────────────────────────────────────────────────
    if (req.type === "parse") {
      const { id, text, file } = req;
      let rawText = "";
      let sizeBytes = 0;

      if (file) {
        rawText = await (file as Blob).text();
        sizeBytes = (file as Blob).size;
      } else if (text !== undefined) {
        rawText = text;
        sizeBytes = new Blob([text]).size;
      }

      const trimmed = rawText.trim();

      if (!trimmed) {
        storedJson = null;
        storedSizeBytes = 0;
        const resp: WorkerResponse = {
          id,
          type: "parse",
          sizeBytes: 0,
          stats: computeStats(null, 0),
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

      // Kick off DuckDB indexing in the background — don't await here so
      // the parse response reaches the main thread immediately.
      // BUT store the promise so search can await it before querying.
      indexingPromise = ensureDB()
        .then(() => indexInDuckDB(flatNodes))
        .finally(() => { indexingPromise = null; });
      indexingPromise.catch(console.error);

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

    // ── SEARCH ─────────────────────────────────────────────────────────────
    if (req.type === "search") {
      const { id, query, options } = req;
      const t0 = performance.now();

      if (!query.trim() || !storedJson) {
        const resp: WorkerResponse = {
          id,
          type: "search",
          matches: [],
          autoExpand: [],
          error: null,
          durationMs: 0,
        };
        self.postMessage(resp);
        return;
      }

      try {
        // Wait for DB init AND any in-flight indexInDuckDB to finish.
        // ensureDB() alone only waits for the connection, NOT the INSERT.
        await ensureDB();
        if (indexingPromise) await indexingPromise;

        const { sql, error: sqlError } = buildSearchSql(query, options);

        if (sqlError) {
          const resp: WorkerResponse = {
            id,
            type: "search",
            matches: [],
            autoExpand: [],
            error: sqlError,
            durationMs: performance.now() - t0,
          };
          self.postMessage(resp);
          return;
        }

        const result = await conn!.query(
          `SELECT pathStr, key, value, valueType, isIndex
           FROM nodes
           WHERE ${sql}
           LIMIT 10000;`
        );

        const rows = result.toArray().map((row: any) => {
          const r = row.toJSON();
          return {
            pathStr: r.pathStr,
            key: r.key,
            value: r.value,
            valueType: r.valueType,
            isIndex: typeof r.isIndex === "bigint" ? Number(r.isIndex) : r.isIndex,
          };
        });

        const { matches, autoExpand } = mapDuckDbRowsToMatches(rows, query, options);
        const durationMs = performance.now() - t0;

        const resp: WorkerResponse = {
          id,
          type: "search",
          matches,
          autoExpand: [...autoExpand],
          error: null,
          durationMs,
        };
        self.postMessage(resp);
      } catch (err) {
        const resp: WorkerResponse = {
          id,
          type: "search",
          matches: [],
          autoExpand: [],
          error: (err as Error).message,
          durationMs: performance.now() - t0,
        };
        self.postMessage(resp);
      }
      return;
    }

    // ── EXPAND ALL ─────────────────────────────────────────────────────────
    if (req.type === "expandAll") {
      const { id } = req;
      const paths = [...allContainerPaths(storedJson)];
      const resp: WorkerResponse = { id, type: "expandAll", paths };
      self.postMessage(resp);
      return;
    }

    // ── DEFAULT EXPAND ─────────────────────────────────────────────────────
    if (req.type === "defaultExpand") {
      const { id } = req;
      const paths = [...defaultExpanded(storedJson)];
      const resp: WorkerResponse = { id, type: "defaultExpand", paths };
      self.postMessage(resp);
      return;
    }

    // ── FLATTEN — kept for API compatibility but no longer called ──────────
    // flattenTree now runs synchronously on the main thread via useMemo.
    if (req.type === "flatten") {
      const { id } = req;
      const resp: WorkerResponse = { id, type: "flatten", flatRows: [] };
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
