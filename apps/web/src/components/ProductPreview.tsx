import { useEffect, useState } from "react";
import { POST_STATES, STATE_LABELS } from "../lib/stateMachine.js";
import { UserAvatarIcon } from "./icons.js";
import type { PostState } from "../lib/types.js";

const CYCLE_MS = 1600;

// Mirrors the accent hue each state gets in STATE_COLORS (lib/stateMachine.ts) — kept as plain
// CSS color strings here since this is a decorative illustration (inline-styled dots/text),
// not the app's real per-status UI, which uses the Tailwind-class version of these same colors.
const STAGE_COLORS: Record<PostState, string> = {
  backlog: "rgba(19,18,17,0.55)",
  todo: "rgba(19,18,17,0.55)",
  in_progress: "rgb(229,81,43)",
  in_review: "rgb(122,90,201)",
  ready: "rgb(26,127,88)",
  posted: "rgb(38,102,178)",
};

/** A non-interactive, animated illustration of the product for signed-out visitors on the
 * login screen — a mock post cycling through the review pipeline, with a looping "comment"
 * callout on a highlighted phrase to show off the select-text-to-comment review flow. */
export function ProductPreview() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setActiveIndex((i) => (i + 1) % POST_STATES.length);
    }, CYCLE_MS);
    return () => clearInterval(id);
  }, []);

  const activeState = POST_STATES[activeIndex];

  return (
    <div className="w-full max-w-[420px] rounded-2xl border border-border bg-surface-1 p-6 shadow-card">
      <p className="mb-4 text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">
        An agent drafts. You review.
      </p>

      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-3 text-text-muted">
          <UserAvatarIcon className="h-7 w-7" />
        </div>
        <div>
          <p className="text-sm font-semibold text-text-primary">Marketing Agent</p>
          <p className="text-xs text-text-muted">Drafted by AI · Now</p>
        </div>
      </div>

      <div className="relative mt-4 text-sm leading-relaxed text-text-primary">
        <p>
          We shipped three things this week that make onboarding{" "}
          <span className="animate-preview-pulse relative rounded bg-accent-soft px-0.5 py-px">
            30% faster
            <span className="animate-preview-tooltip pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-text-primary px-2.5 py-1 text-[11px] font-medium text-surface-1 opacity-0">
              💬 Nice catch
            </span>
          </span>
          . Here&apos;s what changed and why it matters.
        </p>
      </div>

      <div className="mt-7">
        <div className="flex items-center">
          {POST_STATES.map((state, i) => (
            <div key={state} className="flex flex-1 items-center last:flex-none">
              <div
                className="h-2.5 w-2.5 shrink-0 rounded-full transition-all duration-500"
                style={{
                  background: i <= activeIndex ? "var(--color-accent)" : "var(--color-border-strong)",
                  transform: i === activeIndex ? "scale(1.4)" : "scale(1)",
                  boxShadow: i === activeIndex ? "0 0 0 4px var(--color-accent-soft)" : "none",
                }}
              />
              {i < POST_STATES.length - 1 && (
                <div
                  className="h-px flex-1 transition-colors duration-500"
                  style={{ background: i < activeIndex ? "var(--color-accent)" : "var(--color-border)" }}
                />
              )}
            </div>
          ))}
        </div>
        <p
          className="mt-3 text-center text-xs font-semibold transition-colors duration-500"
          style={{ color: STAGE_COLORS[activeState] }}
        >
          {STATE_LABELS[activeState]}
        </p>
      </div>
    </div>
  );
}
