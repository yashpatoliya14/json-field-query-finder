import * as duckdb from "@duckdb/duckdb-wasm";

let db: duckdb.AsyncDuckDB | null = null;
let conn: duckdb.AsyncDuckDBConnection | null = null;

/**
 * Build a bundle that points to same-origin assets instead of jsDelivr CDN.
 *
 * The browser blocks cross-origin Workers (COEP + browser security policy),
 * so we cannot use getJsDelivrBundles() directly. Instead, the .wasm and
 * .worker.js files are served from /public/duckdb/ — same origin, no CORS.
 *
 * selectBundle still runs its feature-detection (wasmExceptions, wasmSIMD, …)
 * and picks the best bundle; we just swap the CDN URLs for local ones.
 */
function getLocalBundles(): duckdb.DuckDBBundles {
  const base = "/duckdb";
  return {
    mvp: {
      mainModule: `${base}/duckdb-mvp.wasm`,
      mainWorker: `${base}/duckdb-browser-mvp.worker.js`,
    },
    eh: {
      mainModule: `${base}/duckdb-eh.wasm`,
      mainWorker: `${base}/duckdb-browser-eh.worker.js`,
    },
  };
}

export async function initDuckDB() {
  if (db && conn) return { db, conn };

  const bundle = await duckdb.selectBundle(getLocalBundles());

  // mainWorker is now same-origin — Worker() constructor succeeds under COEP.
  const worker = new Worker(bundle.mainWorker!);
  const logger = new duckdb.VoidLogger();

  db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  conn = await db.connect();

  return { db, conn };
}

/**
 * Register a File or Blob in DuckDB so it can be queried using standard SQL.
 */
export async function registerFileInDuckDB(file: File | Blob, name = "sift_data.json") {
  const { db } = await initDuckDB();
  if (!db) throw new Error("DuckDB failed to initialize");
  await db.registerFileBuffer(name, new Uint8Array(await file.arrayBuffer()));
}

/**
 * Execute a query against DuckDB-Wasm and return the results as a JSON array.
 */
export async function queryDuckDB(sql: string): Promise<Record<string, any>[]> {
  const { conn } = await initDuckDB();
  if (!conn) throw new Error("DuckDB connection not active");

  const result = await conn.query(sql);

  return result.toArray().map((row) => {
    const obj: Record<string, any> = {};
    const map = row.toJSON();
    for (const [key, val] of Object.entries(map)) {
      obj[key] = typeof val === "bigint" ? Number(val) : val;
    }
    return obj;
  });
}
