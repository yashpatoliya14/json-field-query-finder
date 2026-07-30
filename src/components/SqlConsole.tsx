import { useState, useEffect } from "react";
import { queryDuckDB, initDuckDB } from "../lib/duckdb";

interface SqlConsoleProps {
  hasData: boolean;
  fileName: string;
}

export default function SqlConsole({ hasData, fileName }: SqlConsoleProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Record<string, any>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [execTimeMs, setExecTimeMs] = useState<number | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (hasData) {
      setQuery(`SELECT * FROM read_json_auto('${fileName}') LIMIT 5;`);
    }
  }, [hasData, fileName]);

  const handleInit = async () => {
    setLoading(true);
    setError(null);
    try {
      await initDuckDB();
      setInitialized(true);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleRun = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    const start = performance.now();
    try {
      const data = await queryDuckDB(query);
      setResults(data);
      setExecTimeMs(performance.now() - start);
    } catch (err) {
      setError(String(err));
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const columns = results.length > 0 ? Object.keys(results[0]) : [];

  return (
    <div className="flex h-full flex-col rounded-lg border border-stone bg-panel">
      {/* Console Header */}
      <div className="flex items-center justify-between border-b border-stone/70 px-3 py-2">
        <span className="font-sans text-[11px] font-medium uppercase tracking-[0.12em] text-sediment">
          SQL Query Console (DuckDB-Wasm)
        </span>
        {execTimeMs !== null && !error && (
          <span className="font-mono text-[10.5px] text-teal">
            Executed in {execTimeMs.toFixed(1)} ms
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-3 min-h-0">
        {/* Initialization Overlay */}
        {!initialized ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
            <svg viewBox="0 0 24 24" className="h-10 w-10 text-teal animate-pulse" fill="none" stroke="currentColor" strokeWidth="1.2">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
            </svg>
            <p className="max-w-xs font-sans text-[12.5px] text-sediment">
              Connect to DuckDB-Wasm analytical engine to run SQL queries on your JSON file directly.
            </p>
            <button
              type="button"
              onClick={handleInit}
              disabled={loading}
              className="rounded-md bg-teal/90 px-4 py-2 font-sans text-[12px] font-medium text-riverbed hover:bg-teal disabled:opacity-60"
            >
              {loading ? "Starting Engine…" : "Start SQL Engine"}
            </button>
          </div>
        ) : (
          <>
            {/* SQL Text Area */}
            <div className="flex flex-col gap-2">
              <div className="relative">
                <textarea
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Enter SELECT query..."
                  className="h-28 w-full resize-none rounded-md border border-stone bg-riverbed p-2.5 font-mono text-[12.5px] leading-relaxed text-parchment/90 outline-none focus:border-teal"
                  disabled={!hasData || loading}
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="font-sans text-[10px] text-sediment-dim">
                  Table name: <code className="text-teal">{fileName}</code>
                </span>
                <button
                  type="button"
                  onClick={handleRun}
                  disabled={loading || !hasData || !query.trim()}
                  className="rounded-md bg-teal/90 px-4 py-1.5 font-sans text-[12px] font-medium text-riverbed hover:bg-teal disabled:opacity-50"
                >
                  {loading ? "Running Query…" : "Run SQL Query"}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <p className="rounded-md border border-rust/40 bg-rust/10 px-2.5 py-1.5 font-mono text-[11.5px] text-rust">
                {error}
              </p>
            )}

            {/* Results Table */}
            <div className="flex-1 min-h-0 overflow-auto border border-stone rounded-md bg-riverbed/20">
              {!hasData ? (
                <div className="flex h-full items-center justify-center p-4 text-center font-sans text-[12.5px] text-sediment-dim">
                  Load a JSON file first to run queries.
                </div>
              ) : results.length === 0 ? (
                <div className="flex h-full items-center justify-center p-4 text-center font-sans text-[12.5px] text-sediment-dim">
                  {loading ? "Executing query..." : "Run a query to view results."}
                </div>
              ) : (
                <table className="w-full text-left font-mono text-[12px] border-collapse">
                  <thead>
                    <tr className="bg-panel border-b border-stone text-sediment font-sans text-[11px] uppercase tracking-wider sticky top-0">
                      {columns.map((col) => (
                        <th key={col} className="px-3 py-2 border-r border-stone last:border-r-0">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((row, idx) => (
                      <tr key={idx} className="border-b border-stone/50 hover:bg-panel/40">
                        {columns.map((col) => (
                          <td key={col} className="px-3 py-1.5 border-r border-stone/50 last:border-r-0 max-w-[200px] truncate">
                            {row[col] === null ? (
                              <span className="text-sediment-dim italic">null</span>
                            ) : typeof row[col] === "object" ? (
                              JSON.stringify(row[col])
                            ) : (
                              String(row[col])
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
