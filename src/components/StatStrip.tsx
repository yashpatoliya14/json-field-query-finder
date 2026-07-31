import type { JsonStats } from "../lib/types";

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const STAT_CONFIG: {
  key: keyof Omit<JsonStats, "nodes">;
  label: string;
  accent: string;
  bg: string;
}[] = [
  {
    key: "containers",
    label: "containers",
    accent: "text-teal",
    bg: "bg-teal/10",
  },
  { key: "leaves", label: "leaves", accent: "text-signal", bg: "bg-signal/10" },
  { key: "maxDepth", label: "depth", accent: "text-claim", bg: "bg-claim/10" },
  { key: "sizeBytes", label: "size", accent: "text-gold", bg: "bg-gold/10" },
];

function getValue(
  key: keyof Omit<JsonStats, "nodes">,
  stats: JsonStats,
): string {
  if (key === "sizeBytes") return fmtBytes(stats.sizeBytes);
  return stats[key].toLocaleString();
}

export default function StatStrip({ stats }: { stats: JsonStats }) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {STAT_CONFIG.map(({ key, label, accent, bg }) => (
        <div
          key={label}
          className={`group relative overflow-hidden rounded-lg border border-stone/80 bg-panel px-2 py-2 text-center transition-all hover:border-stone`}
        >
          {/* Subtle accent bar on top */}
          <div className={`absolute inset-x-0 top-0 h-0.5 ${bg} opacity-60`} />
          <div className={`font-mono text-[13px] font-medium ${accent}`}>
            {getValue(key, stats)}
          </div>
          <div className="mt-0.5 font-sans text-[9px] uppercase tracking-[0.12em] text-sediment-dim">
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}
