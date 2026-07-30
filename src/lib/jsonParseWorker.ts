import type { JsonValue } from "./types";

type ParseSuccess = { ok: true; value: JsonValue | null };
type ParseFailure = { ok: false; error: string };
type ParseResult = ParseSuccess | ParseFailure;

self.onmessage = (event: MessageEvent<string>) => {
  try {
    const trimmed = event.data.trim();
    if (!trimmed) {
      (self as DedicatedWorkerGlobalScope).postMessage({ ok: true, value: null } satisfies ParseSuccess);
      return;
    }
    const value = JSON.parse(trimmed) as JsonValue;
    (self as DedicatedWorkerGlobalScope).postMessage({ ok: true, value } satisfies ParseSuccess);
  } catch (e) {
    (self as DedicatedWorkerGlobalScope).postMessage({
      ok: false,
      error: (e as Error).message,
    } satisfies ParseFailure);
  }
};
