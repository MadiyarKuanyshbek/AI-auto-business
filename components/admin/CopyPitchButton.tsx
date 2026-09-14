"use client";

import { useState } from "react";

export default function CopyPitchButton({ pitch }: { pitch: string }) {
  const [copied, setCopied] = useState(false);

  if (!pitch) return <span className="text-zinc-500">—</span>;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(pitch);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex max-w-xs items-start gap-2">
      <p className="line-clamp-2 text-xs text-zinc-600 dark:text-zinc-400" title={pitch}>
        {pitch}
      </p>
      <button
        onClick={handleCopy}
        className="shrink-0 rounded-full border border-black/10 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
      >
        {copied ? "Скопировано" : "Копировать"}
      </button>
    </div>
  );
}
