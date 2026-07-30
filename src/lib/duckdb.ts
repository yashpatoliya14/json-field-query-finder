import * as duckdb from "@duckdb/duckdb-wasm";

let db: duckdb.AsyncDuckDB | null = null;
let conn: duckdb.AsyncDuckDBConnection | null = null;

export async function initDuckDB() {
  if (db && conn) return { db, conn };

  // Select the appropriate bundle from jsDelivr CDN (fast, robust, requires no Vite configuration)
  const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
  const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

  // Instantiate worker
  const worker = new Worker(bundle.mainWorker!);
  const logger = new duckdb.ConsoleLogger();
  
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

  // Register the file as a local file in DuckDB's virtual filesystem (VFS)
  await db.registerFileBuffer(name, new Uint8Array(await file.arrayBuffer()));
}

/**
 * Execute a query against DuckDB-Wasm and return the results as a JSON array.
 */
export async function queryDuckDB(sql: string): Promise<Record<string, any>[]> {
  const { conn } = await initDuckDB();
  if (!conn) throw new Error("DuckDB connection not active");

  const result = await conn.query(sql);
  
  // Convert Arrow table results into standard JSON objects
  return result.toArray().map((row) => {
    const obj: Record<string, any> = {};
    const map = row.toJSON();
    for (const [key, val] of Object.entries(map)) {
      // Handle BigInt conversion so we don't crash JSON.stringify
      if (typeof val === "bigint") {
        obj[key] = Number(val);
      } else {
        obj[key] = val;
      }
    }
    return obj;
  });
}
