export type LoadPhase = "reading" | "inserting" | "parsing" | "indexing";

export interface LoadProgress {
  phase: LoadPhase;
  label: string;
  completed: number;
  total: number;
  percent: number;
  etaMs: number | null;
}

const PHASE_LABELS: Record<LoadPhase, string> = {
  reading: "Reading file",
  inserting: "Inserting text",
  parsing: "Parsing JSON",
  indexing: "Building index",
};

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatEta(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms <= 0) return "almost done";
  if (ms < 1000) return "< 1s left";
  const sec = Math.ceil(ms / 1000);
  if (sec < 60) return `~${sec}s left`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem > 0 ? `~${min}m ${rem}s left` : `~${min}m left`;
}

/** Tracks throughput and estimates remaining time from completed work. */
export class ProgressTracker {
  private start = performance.now();
  private lastCompleted = 0;
  private lastTick = this.start;
  private smoothedRate = 0;

  constructor(private phase: LoadPhase) {}

  snapshot(completed: number, total: number, label?: string): LoadProgress {
    const now = performance.now();
    const elapsed = now - this.start;
    const percent = total > 0 ? Math.min(99, Math.round((completed / total) * 100)) : 0;

    const delta = completed - this.lastCompleted;
    const dt = now - this.lastTick;
    if (delta > 0 && dt > 0) {
      const instant = delta / dt;
      this.smoothedRate = this.smoothedRate === 0 ? instant : this.smoothedRate * 0.7 + instant * 0.3;
      this.lastCompleted = completed;
      this.lastTick = now;
    } else if (elapsed > 300 && completed === 0 && total > 0) {
      // Cold-start estimate before first byte completes (rough ~40 MB/s read, ~20 MB/s parse).
      const guessRate =
        this.phase === "reading" ? total / 4000 : this.phase === "parsing" ? total / 8000 : total / 6000;
      this.smoothedRate = guessRate;
    }

    let etaMs: number | null = null;
    if (total > 0 && completed > 0 && completed < total && this.smoothedRate > 0) {
      etaMs = (total - completed) / this.smoothedRate;
    } else if (total > 0 && completed === 0 && this.smoothedRate > 0) {
      etaMs = total / this.smoothedRate;
    }

    return {
      phase: this.phase,
      label: label ?? PHASE_LABELS[this.phase],
      completed,
      total,
      percent: completed >= total ? 100 : Math.max(percent, completed > 0 ? 1 : 0),
      etaMs,
    };
  }

  done(label?: string): LoadProgress {
    return {
      phase: this.phase,
      label: label ?? PHASE_LABELS[this.phase],
      completed: 1,
      total: 1,
      percent: 100,
      etaMs: 0,
    };
  }
}
