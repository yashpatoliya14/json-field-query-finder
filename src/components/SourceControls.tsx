import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { formatBytes } from "../lib/progress";
import type { LoadProgressApi } from "../hooks/useLoadProgress";
import { insertTextareaChunked, setTextareaValueChunked } from "../lib/scheduler";
import { PenIcon, UploadIcon, XIcon } from "./icons";

export interface SourceControlsHandle {
  getText: () => string;
  setText: (text: string, onProgress?: (completed: number, total: number) => void) => Promise<void>;
  clear: () => void;
}

interface SourceControlsProps {
  editorOpen: boolean;
  onToggleEditor: () => void;
  initialText: string;
  onApply: (text: string) => void;
  onSample: () => void;
  onClear: () => void;
  onFile: (file: File) => void;
  parseError: string | null;
  load: LoadProgressApi;
  isLoading: boolean;
}

function mergeAtCursor(textarea: HTMLTextAreaElement, inserted: string): string {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  return textarea.value.slice(0, start) + inserted + textarea.value.slice(end);
}

const SourceControls = forwardRef<SourceControlsHandle, SourceControlsProps>(function SourceControls(
  {
    editorOpen,
    onToggleEditor,
    initialText,
    onApply,
    onSample,
    onClear,
    onFile,
    parseError,
    load,
    isLoading,
  },
  ref
) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bufferRef = useRef<string | null>(null);
  const [charCount, setCharCount] = useState(initialText.length);
  const [largeBuffer, setLargeBuffer] = useState(false);

  useImperativeHandle(ref, () => ({
    getText: () => bufferRef.current ?? textareaRef.current?.value ?? "",
    setText: async (text: string, onProgress?: (completed: number, total: number) => void) => {
      bufferRef.current = null;
      setLargeBuffer(false);

      const textarea = textareaRef.current;
      if (!textarea) {
        bufferRef.current = text;
        setLargeBuffer(text.length > 128 * 1024);
        setCharCount(text.length);
        onProgress?.(text.length, text.length);
        return;
      }

      load.begin("inserting");
      const report = (completed: number, total: number) => {
        load.report(completed, total);
        onProgress?.(completed, total);
      };

      const buffered = await setTextareaValueChunked(textarea, text, report);
      if (buffered) {
        bufferRef.current = text;
        setLargeBuffer(true);
        textarea.value = "";
      }
      setCharCount(text.length);
    },
    clear: () => {
      bufferRef.current = null;
      setLargeBuffer(false);
      const textarea = textareaRef.current;
      if (textarea) textarea.value = "";
      setCharCount(0);
    },
  }));

  async function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = e.clipboardData.getData("text/plain");
    if (!pasted || !textareaRef.current) return;

    e.preventDefault();
    load.begin("inserting");

    const report = (completed: number, total: number) => load.report(completed, total);
    const buffered = await insertTextareaChunked(textareaRef.current, pasted, report);

    let text: string;
    if (buffered) {
      text = mergeAtCursor(textareaRef.current, pasted);
      bufferRef.current = text;
      setLargeBuffer(true);
      textareaRef.current.value = "";
    } else {
      bufferRef.current = null;
      setLargeBuffer(false);
      text = textareaRef.current.value;
    }

    setCharCount(text.length);
    onApply(text);
  }

  function handleApplyClick() {
    onApply(bufferRef.current ?? textareaRef.current?.value ?? "");
  }

  function handleClearClick() {
    bufferRef.current = null;
    setLargeBuffer(false);
    onClear();
  }

  return (
    <div className="rounded-lg border border-stone bg-panel">
      <div className="flex items-center justify-between gap-2 border-b border-stone/70 px-3 py-2">
        <span className="font-sans text-[11px] font-medium uppercase tracking-[0.12em] text-sediment">
          Source
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onSample}
            disabled={isLoading}
            className="rounded border border-stone px-2 py-1 font-sans text-[11px] text-sediment hover:border-teal hover:text-teal disabled:opacity-50"
          >
            Load sample
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="flex items-center gap-1 rounded border border-stone px-2 py-1 font-sans text-[11px] text-sediment hover:border-teal hover:text-teal disabled:opacity-50"
          >
            <UploadIcon className="h-3 w-3" />
            Upload
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json,.txt"
            className="hidden"
            disabled={isLoading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFile(file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={onToggleEditor}
            aria-pressed={editorOpen}
            className={`flex items-center gap-1 rounded border px-2 py-1 font-sans text-[11px] transition-colors ${
              editorOpen
                ? "border-gold/60 text-gold"
                : "border-stone text-sediment hover:border-teal hover:text-teal"
            }`}
          >
            <PenIcon className="h-3 w-3" />
            {editorOpen ? "Close" : "Paste JSON"}
          </button>
        </div>
      </div>

      {editorOpen && (
        <div className="p-3">
          {largeBuffer ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-md border border-teal/30 bg-teal-dim/30 px-4 text-center">
              <p className="font-sans text-[13px] text-parchment">Large document loaded</p>
              <p className="font-mono text-[12px] text-teal">{formatBytes(charCount)}</p>
              <p className="max-w-xs font-sans text-[11px] leading-relaxed text-sediment-dim">
                Hidden from editor for performance — tree view is active below.
              </p>
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              defaultValue={initialText}
              onPaste={handlePaste}
              onInput={(e) => {
                bufferRef.current = null;
                setLargeBuffer(false);
                setCharCount(e.currentTarget.value.length);
              }}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  handleApplyClick();
                }
              }}
              spellCheck={false}
              disabled={isLoading}
              placeholder='Paste JSON here, e.g. { "claim": "CLM-0142" }'
              className="h-40 w-full resize-y rounded-md border border-stone bg-riverbed p-2.5 font-mono text-[12.5px] leading-relaxed text-parchment/90 outline-none focus:border-teal disabled:opacity-60"
            />
          )}
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleApplyClick}
                disabled={isLoading}
                className="rounded-md bg-teal/90 px-3 py-1.5 font-sans text-[12px] font-medium text-riverbed hover:bg-teal disabled:opacity-50"
              >
                Apply JSON
              </button>
              <button
                type="button"
                onClick={handleClearClick}
                disabled={isLoading}
                className="flex items-center gap-1 rounded-md border border-stone px-2.5 py-1.5 font-sans text-[12px] text-sediment hover:border-rust hover:text-rust disabled:opacity-50"
              >
                <XIcon className="h-3 w-3" />
                Clear
              </button>
            </div>
            <span className="font-mono text-[10.5px] text-sediment-dim">
              {`${charCount.toLocaleString()} chars · paste to apply immediately`}
            </span>
          </div>
          {parseError && (
            <p className="mt-2 rounded-md border border-rust/40 bg-rust/10 px-2.5 py-1.5 font-mono text-[11.5px] text-rust">
              {parseError}
            </p>
          )}
        </div>
      )}
    </div>
  );
});

export default SourceControls;
