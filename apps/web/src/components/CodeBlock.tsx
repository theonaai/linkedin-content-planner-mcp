import { useState } from "react";

export function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    let ok = true;
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // Clipboard API can be denied (permissions policy, unfocused document, older browsers) —
      // fall back to the legacy selection-based copy instead of silently doing nothing. It
      // reports success via a boolean return rather than throwing, so check that explicitly.
      const textarea = document.createElement("textarea");
      textarea.value = code;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        ok = document.execCommand("copy");
      } finally {
        document.body.removeChild(textarea);
      }
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <div className="relative overflow-x-auto rounded-xl border border-border bg-surface-2 py-3 pl-4 pr-20">
      <pre className="text-[13px] leading-relaxed text-text-primary">
        <code>{code}</code>
      </pre>
      <button
        onClick={handleCopy}
        className="absolute right-2.5 top-2.5 rounded-lg border border-border bg-surface-1 px-2.5 py-1 text-[11px] font-medium text-text-secondary hover:text-text-primary"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
