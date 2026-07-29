import type { Range } from "../lib/types";

export default function Highlight({ text, ranges }: { text: string; ranges: Range[] }) {
  if (!ranges.length) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let last = 0;
  ranges.forEach(([start, end], i) => {
    if (start > last) parts.push(<span key={`t-${i}`}>{text.slice(last, start)}</span>);
    parts.push(
      <mark
        key={`m-${i}`}
        className="rounded-[3px] bg-gold/25 px-[1px] text-gold shadow-[0_0_0_1px_rgba(231,178,56,0.35)]"
      >
        {text.slice(start, end)}
      </mark>
    );
    last = end;
  });
  if (last < text.length) parts.push(<span key="tail">{text.slice(last)}</span>);
  return <>{parts}</>;
}
