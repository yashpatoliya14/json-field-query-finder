import { useRef, useEffect, useCallback } from "react";
import { PenIcon, UploadIcon, XIcon } from "./icons";

interface SourceControlsProps {
  editorOpen: boolean;
  onToggleEditor: () => void;
  draftText: string;
  onDraftChange: (text: string) => void;
  /** Called immediately after paste with the pasted text */
  onPasteApply: (text: string) => void;
  onApply: () => void;
  onSample: () => void;
  onClear: () => void;
  onFile: (file: File) => void;
  parseError: string | null;
  processing: boolean;
}

export default function SourceControls({
  editorOpen,
  onToggleEditor,
  draftText,
  onDraftChange,
  onPasteApply,
  onApply,
  onSample,
  onClear,
  onFile,
  parseError,
  processing,
}: SourceControlsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const glowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync external draftText changes (sample load, clear, file upload) into the uncontrolled textarea
  const lastExternalText = useRef(draftText);
  useEffect(() => {
    if (draftText !== lastExternalText.current) {
      lastExternalText.current = draftText;
      if (textareaRef.current) {
        textareaRef.current.value = draftText;
      }
    }
  }, [draftText]);

  // Debounce propagating draftText changes to parent state during active typing
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    lastExternalText.current = val;

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      onDraftChange(val);
    }, 200);
  };

  // ⚡ Instant paste handler — fires immediately without needing "Apply"
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const pasted = e.clipboardData.getData("text");
      if (!pasted.trim()) return;

      // Add paste-glow animation
      const ta = textareaRef.current;
      if (ta) {
        ta.classList.remove("paste-glow");
        // Force reflow to restart animation
        void ta.offsetWidth;
        ta.classList.add("paste-glow");
        if (glowTimerRef.current) clearTimeout(glowTimerRef.current);
        glowTimerRef.current = setTimeout(() => {
          ta.classList.remove("paste-glow");
        }, 700);
      }

      // Let the browser insert the text first, then read it
      requestAnimationFrame(() => {
        const fullText = textareaRef.current?.value ?? pasted;
        lastExternalText.current = fullText;
        onDraftChange(fullText);
        onPasteApply(fullText);
      });
    },
    [onDraftChange, onPasteApply]
  );

  const handleApplyClick = () => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    const currentVal = textareaRef.current ? textareaRef.current.value : draftText;
    onDraftChange(currentVal);
    onApply();
  };

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
            className="rounded border border-stone px-2 py-1 font-sans text-[11px] text-sediment hover:border-teal hover:text-teal"
          >
            Load sample
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 rounded border border-stone px-2 py-1 font-sans text-[11px] text-sediment hover:border-teal hover:text-teal"
          >
            <UploadIcon className="h-3 w-3" />
            Upload
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json,.txt"
            className="hidden"
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
          <div className="relative">
            <textarea
              ref={textareaRef}
              defaultValue={draftText}
              onChange={handleTextareaChange}
              onPaste={handlePaste}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  handleApplyClick();
                }
              }}
              spellCheck={false}
              placeholder='Paste JSON here — processes instantly! e.g. { "claim": "CLM-0142" }'
              className="h-40 w-full resize-y rounded-md border border-stone bg-riverbed p-2.5 font-mono text-[12.5px] leading-relaxed text-parchment/90 outline-none focus:border-teal transition-colors"
            />
            {/* Processing shimmer overlay */}
            {processing && (
              <div className="absolute inset-0 rounded-md shimmer pointer-events-none" />
            )}
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleApplyClick}
                disabled={processing}
                className="flex items-center gap-1.5 rounded-md bg-teal/90 px-3 py-1.5 font-sans text-[12px] font-medium text-riverbed hover:bg-teal disabled:opacity-60 transition-opacity"
              >
                {processing ? (
                  <>
                    <svg
                      className="processing-spin h-3 w-3"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                    Processing…
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor">
                      <path d="M13 2L4.5 13.5H11L10 22L20.5 10H14L13 2Z" />
                    </svg>
                    Apply JSON
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={onClear}
                className="flex items-center gap-1 rounded-md border border-stone px-2.5 py-1.5 font-sans text-[12px] text-sediment hover:border-rust hover:text-rust"
              >
                <XIcon className="h-3 w-3" />
                Clear
              </button>
            </div>
            <span className="font-mono text-[10.5px] text-sediment-dim">
              Paste = instant · ⌘/Ctrl+Enter to apply
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
}
