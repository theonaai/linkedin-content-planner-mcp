import { useEffect, useState } from "react";
import { POST_STATES, STATE_LABELS } from "../lib/stateMachine.js";
import { UserAvatarIcon } from "./icons.js";
import type { PostState } from "../lib/types.js";

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

// Names only, not logos — these render as small colored monogram dots + text, never a copy of
// anyone's actual mark. Illustrates that any MCP-connected agent (not just one vendor's) can
// pick up a post at any stage: an AI coding agent drafts, another applies review feedback, and
// Theona is the identity/org layer every login and MCP token is scoped through.
const AGENTS = [
  { id: "claude", label: "Claude Code", color: "rgb(38,102,178)" },
  { id: "codex", label: "Codex", color: "rgb(122,90,201)" },
  { id: "theona", label: "Theona", color: "rgb(229,81,43)" },
] as const;

type AgentId = (typeof AGENTS)[number]["id"];

interface Phase {
  stateIndex: number; // index into POST_STATES
  agent: AgentId;
  duration: number;
  /** The reviewable phrase is highlighted and gently pulsing. */
  reviewing?: boolean;
  /** The reviewer's comment callout is visible. */
  comment?: boolean;
  /** Show the revised phrase instead of the original. */
  revised?: boolean;
  /** Just switched to the revised phrase — plays a one-shot "updated" flash. */
  justUpdated?: boolean;
  /** The scheduled day on the mini calendar gets its checkmark. */
  posted?: boolean;
}

// One pass through this is the whole story: an agent drafts, a reviewer leaves a comment on a
// specific claim, another agent fixes it, and the post goes out on its scheduled day. Each step
// owns its own duration and flags, so nothing here is an independent looping animation fighting
// another one for attention — this was the bug behind the old version showing the comment
// callout twice per pipeline cycle.
const TIMELINE: Phase[] = [
  { stateIndex: 0, agent: "claude", duration: 1300 },
  { stateIndex: 1, agent: "claude", duration: 1000 },
  { stateIndex: 2, agent: "codex", duration: 1600 },
  { stateIndex: 3, agent: "theona", duration: 1300, reviewing: true },
  { stateIndex: 3, agent: "theona", duration: 2200, reviewing: true, comment: true },
  { stateIndex: 3, agent: "codex", duration: 1300, revised: true, justUpdated: true },
  { stateIndex: 4, agent: "theona", duration: 1100, revised: true },
  { stateIndex: 5, agent: "theona", duration: 2600, revised: true, posted: true },
];

const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const SCHEDULED_DAY_INDEX = 3;

/** A non-interactive, animated illustration of the product for signed-out visitors on the
 * login screen: a mock post moves through the real review pipeline, picked up by a different
 * agent at each stage, gets a reviewer comment on a specific claim, has that claim corrected,
 * and lands on its scheduled day. */
export function ProductPreview() {
  const [step, setStep] = useState(0);
  const phase = TIMELINE[step];

  useEffect(() => {
    const id = setTimeout(() => setStep((s) => (s + 1) % TIMELINE.length), phase.duration);
    return () => clearTimeout(id);
  }, [step, phase.duration]);

  const activeState = POST_STATES[phase.stateIndex];

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

      <div className="mt-4 flex items-center gap-1.5">
        {AGENTS.map((a) => {
          const active = a.id === phase.agent;
          return (
            <span
              key={a.id}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all duration-500 ${
                active ? "border-transparent text-white" : "border-border bg-surface-2 text-text-muted"
              }`}
              style={active ? { background: a.color } : undefined}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: active ? "white" : a.color }} />
              {a.label}
            </span>
          );
        })}
      </div>

      <div className="relative mt-4 text-sm leading-relaxed text-text-primary">
        <p>
          We shipped three things this week that make onboarding{" "}
          <span
            key={phase.revised ? "revised" : "original"}
            className={`relative rounded px-0.5 py-px transition-colors duration-500 ${
              phase.reviewing ? "animate-preview-pulse bg-accent-soft" : phase.justUpdated ? "animate-preview-flash" : ""
            }`}
          >
            {phase.revised ? "2.4x faster (verified)" : "30% faster"}
            <span
              className={`pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-text-primary px-2.5 py-1 text-[11px] font-medium text-surface-1 transition-all duration-300 ${
                phase.comment ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
              }`}
            >
              💬 Can you verify that number?
            </span>
          </span>
          {phase.revised ? " — updated after review. " : ". "}
          Here&apos;s what changed and why it matters.
        </p>
      </div>

      <div className="mt-6">
        <div className="flex items-center">
          {POST_STATES.map((state, i) => (
            <div key={state} className="flex flex-1 items-center last:flex-none">
              <div
                className="h-2.5 w-2.5 shrink-0 rounded-full transition-all duration-500"
                style={{
                  background: i <= phase.stateIndex ? "var(--color-accent)" : "var(--color-border-strong)",
                  transform: i === phase.stateIndex ? "scale(1.4)" : "scale(1)",
                  boxShadow: i === phase.stateIndex ? "0 0 0 4px var(--color-accent-soft)" : "none",
                }}
              />
              {i < POST_STATES.length - 1 && (
                <div
                  className="h-px flex-1 transition-colors duration-500"
                  style={{ background: i < phase.stateIndex ? "var(--color-accent)" : "var(--color-border)" }}
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

      <div className="mt-5 flex items-center gap-3 rounded-xl border border-border bg-surface-2 p-3">
        <span className="text-[11px] font-medium text-text-muted">Scheduled</span>
        <div className="flex flex-1 justify-end gap-1.5">
          {WEEK_DAYS.map((day, i) => (
            <div
              key={day}
              className={`relative flex h-7 w-7 items-center justify-center rounded-md text-[10px] font-medium transition-colors duration-500 ${
                i === SCHEDULED_DAY_INDEX ? "bg-accent-soft text-accent-text" : "text-text-muted"
              }`}
              title={day}
            >
              {day[0]}
              {i === SCHEDULED_DAY_INDEX && phase.posted && (
                <span
                  key="check"
                  className="animate-preview-check-pop absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[rgb(26,127,88)] text-[8px] text-white"
                >
                  ✓
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
