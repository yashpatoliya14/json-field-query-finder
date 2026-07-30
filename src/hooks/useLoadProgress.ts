import { useCallback, useRef, useState } from "react";
import { ProgressTracker, type LoadPhase, type LoadProgress } from "../lib/progress";

export function useLoadProgress() {
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const trackerRef = useRef<ProgressTracker | null>(null);
  const pendingRef = useRef<LoadProgress | null>(null);
  const rafRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    rafRef.current = null;
    if (pendingRef.current) setProgress(pendingRef.current);
  }, []);

  const schedule = useCallback(
    (snap: LoadProgress) => {
      pendingRef.current = snap;
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(flush);
      }
    },
    [flush]
  );

  const begin = useCallback(
    (phase: LoadPhase) => {
      trackerRef.current = new ProgressTracker(phase);
      schedule(trackerRef.current.snapshot(0, 1));
    },
    [schedule]
  );

  const report = useCallback(
    (completed: number, total: number, label?: string) => {
      const tracker = trackerRef.current;
      if (!tracker) return;
      schedule(tracker.snapshot(completed, total, label));
    },
    [schedule]
  );

  const end = useCallback(() => {
    trackerRef.current = null;
    pendingRef.current = null;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setProgress(null);
  }, []);

  return { progress, begin, report, end, isLoading: progress !== null };
}

export type LoadProgressApi = Pick<ReturnType<typeof useLoadProgress>, "begin" | "report" | "end">;
