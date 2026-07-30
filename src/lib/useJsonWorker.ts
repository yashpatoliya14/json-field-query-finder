/**
 * useJsonWorker — thin hook that talks to the JSON web worker.
 * Returns send() which posts a request and returns a Promise<WorkerResponse>.
 */
import { useEffect, useRef, useCallback } from "react";
import type { WorkerSend, WorkerResponse } from "./jsonWorker";

type PendingMap = Map<number, (r: WorkerResponse) => void>;

export function useJsonWorker() {
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef<PendingMap>(new Map());
  const nextIdRef = useRef(1);

  useEffect(() => {
    const worker = new Worker(new URL("./jsonWorker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const res = e.data;
      const resolve = pendingRef.current.get(res.id);
      if (resolve) {
        pendingRef.current.delete(res.id);
        resolve(res);
      }
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const send = useCallback((req: WorkerSend): Promise<WorkerResponse> => {
    return new Promise((resolve) => {
      const id = nextIdRef.current++;
      pendingRef.current.set(id, resolve);
      workerRef.current?.postMessage({ ...req, id });
    });
  }, []);

  return { send };
}
