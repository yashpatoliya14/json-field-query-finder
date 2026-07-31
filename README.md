# SIFT — JSON Field & Value Explorer

SIFT is a fast, all-in-the-browser tool for exploring, searching, and querying JSON data. Paste or upload a JSON file, browse it as an interactive tree, search across keys and values (including regex and MongoDB-style query syntax), and — when you need real analytical power — run raw SQL against it with an embedded DuckDB engine. Everything runs client-side; no data ever leaves your browser.

## ✨ Features

### 🌲 Interactive tree view
- Renders any JSON document as a collapsible, virtualized tree (powered by `react-window`), so even very large files stay smooth to scroll.
- Expand/collapse individual nodes or whole subtrees; containers (objects/arrays) show live key/item counts.
- Click any node to copy its JSON path (`$.foo.bar[2]`) to the clipboard.
- Syntax-aware highlighting distinguishes keys, strings, numbers, booleans, and `null`.

### 🔍 Powerful search
- Search across **keys**, **values**, or **both** at once.
- Toggle **case-sensitive** matching and **regular expression** mode.
- Matches are highlighted inline in the tree, with a match counter and **Next/Previous** navigation (`Enter` / `Shift+Enter`).
- Ancestor nodes of a match are auto-expanded so results are never hidden in a collapsed branch.
- A **Match Ledger** panel lists every match with its path, key, and value preview for quick scanning.
- Debounced input keeps the UI responsive while typing, even on large documents.
- Search is executed against an in-browser DuckDB engine, so results come back with a reported query time (e.g. `⚡ 3 ms`).

### 🗄️ MongoDB-style query syntax
- In addition to plain text/regex search, SIFT understands MongoDB-flavored query objects, e.g.:
  ```json
  { "age": { "$gt": 20 } }
  ```
  These are parsed and translated into an equivalent SQL `WHERE` clause under the hood.

### 🧮 SQL Console (DuckDB-Wasm)
- Spin up an embedded [DuckDB-Wasm](https://duckdb.org/docs/api/wasm/overview) analytical engine directly in the browser.
- Your loaded JSON is registered as a queryable table — write and run arbitrary `SELECT` statements against it.
- Results render in a scrollable, sticky-header table with per-cell type awareness (`null`, objects, primitives).
- Query execution time is displayed after every run.

### 📥 Flexible data input
- **Paste** JSON directly into an editor panel — processing kicks in instantly on paste, no extra step required.
- **Upload** a `.json` or `.txt` file from disk.
- **Load sample data** to try the tool immediately without your own file.
- **Apply** via button or `⌘/Ctrl + Enter`; **Clear** to reset.
- Friendly parse-error messages if the input isn't valid JSON.

### 📊 Live stats
- A stat strip shows node count, leaf count, container count, max depth, and file size — updated as you load or edit data.

### ⚡ Performance-minded architecture
- Tree flattening and stats run synchronously on the main thread via `useMemo` for instant feedback on typical documents.
- A dedicated JSON worker (`jsonWorker.ts`) offloads heavier parsing/search work off the main thread when needed, keeping the UI responsive.
- DuckDB-Wasm runs in its own Worker with same-origin `.wasm`/worker assets (avoiding CDN/CORS + COEP issues).

## 🖥️ Tech Stack

| Layer | Technology |
|---|---|
| UI framework | React 19 + TypeScript |
| Build tool | Vite 7 |
| Styling | Tailwind CSS 4 |
| Virtualization | `react-window` |
| Analytical engine | `@duckdb/duckdb-wasm` |
| Utilities | `clsx`, `tailwind-merge` |

## 📁 Project Structure

```
src/
├── App.tsx                    # Top-level app state & orchestration
├── main.tsx                   # React entry point
├── index.css                  # Global styles / Tailwind entry
├── components/
│   ├── Header.tsx              # Brand bar + live node/match counters
│   ├── SourceControls.tsx      # Paste / upload / sample / clear JSON input
│   ├── SearchControls.tsx      # Search bar, mode toggles, case/regex, nav
│   ├── SqlConsole.tsx          # DuckDB-Wasm SQL query console
│   ├── StatStrip.tsx           # Node/leaf/container/depth/size stats
│   ├── MatchLedger.tsx         # List of all current search matches
│   ├── TreePanel.tsx           # Virtualized JSON tree container
│   ├── VirtualRow.tsx          # Single virtualized tree row
│   ├── JsonNode.tsx            # Renders an individual JSON node
│   ├── Highlight.tsx           # Inline match-highlighting text renderer
│   ├── LightningZap.tsx        # UI flourish/animation component
│   └── icons.tsx               # Inline SVG icon set
├── lib/
│   ├── types.ts                 # Shared TypeScript types
│   ├── jsonTools.ts             # Path formatting, stats, search-range helpers
│   ├── flattenTree.ts           # Converts nested JSON into flat, virtualizable rows
│   ├── mongoSearch.ts           # MongoDB-style query parsing → SQL translation
│   ├── duckdb.ts                # DuckDB-Wasm init, file registration, querying
│   ├── jsonWorker.ts            # Web Worker for off-main-thread JSON processing
│   ├── useJsonWorker.ts         # React hook wrapping the JSON worker
│   └── sampleData.ts            # Built-in sample JSON document
└── utils/
    └── cn.ts                    # className merge helper (clsx + tailwind-merge)

public/
└── duckdb/                      # Same-origin DuckDB-Wasm binaries & workers
    ├── duckdb-mvp.wasm
    ├── duckdb-eh.wasm
    ├── duckdb-browser-mvp.worker.js
    └── duckdb-browser-eh.worker.js
```

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) 18+ (or [Bun](https://bun.sh/), since a `bun.lock` is included)

### Installation

```bash
# with npm
npm install

# or with bun
bun install
```

### Development

```bash
npm run dev
# or
bun run dev
```

This starts the Vite dev server (default: `http://localhost:5173`) with hot module reloading.

### Build for production

```bash
npm run build
# or
bun run build
```

Outputs an optimized, single-file-friendly production build (via `vite-plugin-singlefile`) to `dist/`.

### Preview the production build

```bash
npm run preview
# or
bun run preview
```

## 🧭 Usage Guide

1. **Load data** — use the *Source* panel to paste JSON, upload a file, or click **Load sample** to try it out immediately.
2. **Browse** — explore the parsed structure in the *Tree* tab; click any node to expand/collapse it or copy its path.
3. **Search** — type a query into the search bar. Choose whether to match **Keys**, **Values**, or **Both**; toggle **Aa** for case-sensitivity and **.\*** for regex. Use the arrows (or `Enter` / `Shift+Enter`) to step through matches.
4. **Query with SQL** — switch to the *SQL* tab, click **Start SQL Engine** to boot DuckDB-Wasm, then write and run any `SELECT` statement against your loaded data.
5. **Inspect stats** — keep an eye on the stat strip and header badges for live node/match counts as you work.

## 🔒 Privacy

All parsing, searching, and querying happens locally in your browser (including the DuckDB analytical engine, which runs as WebAssembly). No JSON data you load into SIFT is uploaded to any server.

## 📄 License

No license file is included in this project. Add one (e.g. MIT) if you intend to distribute or open-source it.
