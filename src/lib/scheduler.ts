/** Yield control back to the browser so the UI stays responsive. */
export function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

export const LARGE_TEXT_THRESHOLD = 128 * 1024;
export const DEFAULT_CHUNK_SIZE = 256 * 1024;

export type ChunkProgress = (completed: number, total: number) => void;

/** Replace textarea content in chunks; skips DOM updates for very large text. */
export async function setTextareaValueChunked(
  textarea: HTMLTextAreaElement,
  text: string,
  onProgress?: ChunkProgress,
  chunkSize = DEFAULT_CHUNK_SIZE
): Promise<boolean> {
  const total = text.length;
  onProgress?.(0, total);

  if (total > LARGE_TEXT_THRESHOLD) {
    onProgress?.(total, total);
    return true;
  }

  textarea.value = "";
  for (let i = 0; i < total; i += chunkSize) {
    textarea.value += text.slice(i, i + chunkSize);
    onProgress?.(Math.min(i + chunkSize, total), total);
    await yieldToMain();
  }
  textarea.selectionStart = textarea.selectionEnd = total;
  return false;
}

/** Insert pasted text at the cursor in chunks; returns true if buffered off-DOM. */
export async function insertTextareaChunked(
  textarea: HTMLTextAreaElement,
  text: string,
  onProgress?: ChunkProgress,
  chunkSize = DEFAULT_CHUNK_SIZE
): Promise<boolean> {
  const total = text.length;
  onProgress?.(0, total);

  if (total > LARGE_TEXT_THRESHOLD) {
    onProgress?.(total, total);
    return true;
  }

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);

  textarea.value = before;
  let inserted = 0;
  for (let i = 0; i < total; i += chunkSize) {
    const chunk = text.slice(i, i + chunkSize);
    textarea.value += chunk;
    inserted += chunk.length;
    textarea.selectionStart = textarea.selectionEnd = start + inserted;
    onProgress?.(inserted, total);
    await yieldToMain();
  }
  textarea.value += after;
  textarea.selectionStart = textarea.selectionEnd = start + total;
  return false;
}
