import type { JsonStats } from "../lib/types";

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function StatStrip({ stats }: { stats: JsonStats }) {
  const items: [string, string][] = [
    ["containers", stats.containers.toLocaleString()],
    ["leaves", stats.leaves.toLocaleString()],
    ["depth", stats.maxDepth.toLocaleString()],
    ["size", fmtBytes(stats.sizeBytes)],
  ];
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-md border border-stone bg-panel px-2 py-1.5 text-center">
          <div className="font-mono text-[13px] text-parchment">{value}</div>
          <div className="mt-0.5 font-sans text-[9.5px] uppercase tracking-[0.1em] text-sediment-dim">
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}
