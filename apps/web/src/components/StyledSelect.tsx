import type { SelectHTMLAttributes } from "react";

/** A styled <select> matching the app's text-input look — a plain <select> renders with the
 * OS's native chrome (different padding/arrow) unless appearance is reset and a custom
 * indicator is drawn back in. */
export function StyledSelect({
  compact = false,
  className = "",
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { compact?: boolean }) {
  return (
    <div className="relative">
      <select
        {...props}
        className={`w-full cursor-pointer appearance-none rounded-xl border border-border bg-surface-2 pl-3.5 text-text-primary outline-none focus:border-accent focus:bg-surface-1 focus:ring-4 focus:ring-accent-soft disabled:cursor-not-allowed disabled:opacity-50 ${
          compact ? "py-1.5 pr-8 text-xs" : "py-3 pr-9 text-sm"
        } ${className}`}
      />
      <span
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-text-muted ${
          compact ? "right-2.5 text-[9px]" : "right-3.5 text-[10px]"
        }`}
      >
        ▾
      </span>
    </div>
  );
}
