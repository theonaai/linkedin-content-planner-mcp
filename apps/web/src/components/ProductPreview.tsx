import { useEffect, useState, type ReactNode } from "react";
import { toLinkedInPreview } from "@linkedin-planner/formatting";
import { POST_STATES, STATE_LABELS } from "../lib/stateMachine.js";
import { CommentIcon, GlobeIcon, RepostIcon, SendIcon, ThumbsUpIcon, UserAvatarIcon } from "./icons.js";
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

// Each service's real brand color (not its logo — colors aren't trademark-protectable the way
// a mark is, so this is safe to use without a license, unlike reproducing an actual logo file
// we don't have rights to). Anthropic's clay #D4A27F and OpenAI's teal #10A37F are their
// published brand colors; Theona's orange is this app's own accent, sourced from the Theona
// design system this whole app is built on. Illustrates that any MCP-connected agent (not just
// one vendor's) can pick up a post at any stage: an AI coding agent drafts, another applies
// review feedback, and Theona is the identity/org layer every login and MCP token is scoped
// through.
// Anthropic's clay is light, so white text on it (fine for Codex's teal and Theona's orange)
// would be hard to read — each agent names the text color that's actually legible on its color.
const AGENTS = [
  { id: "claude", label: "Claude Code", color: "rgb(212,162,127)", textOnColor: "rgb(46,35,25)" },
  { id: "codex", label: "Codex", color: "rgb(16,163,127)", textOnColor: "white" },
  { id: "theona", label: "Theona", color: "rgb(229,81,43)", textOnColor: "white" },
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
// another one for attention — this was the bug behind an earlier version showing the comment
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

const WEEKDAY_LETTERS = ["M", "T", "W", "T", "F"];
const SCHEDULED_DAY_INDEX = 3;

/** This week's real Mon–Fri dates — computed once per mount, not re-derived every render,
 * since "today" can't change while this illustration is on screen. */
function getCurrentWeekdays(): Date[] {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  return Array.from({ length: 5 }, (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));
}

// Real markdown-subset source, run through the app's actual formatting engine (same function
// LinkedInPreview.tsx uses) — this is a genuine formatting demo, not text styled to look bold.
// The reviewable claim is deliberately its own segment (not part of the markdown source) so it
// can be swapped/highlighted independently of the surrounding formatted text.
const INTRO_MD = "**We shipped three things this week** that make onboarding *dramatically* faster:";
const BULLETS_BEFORE_CLAIM_MD =
  "- Smarter defaults out of the box\n- One-click import from your old stack\n- Setup time down to";

const LINKEDIN_BLUE = "#0a66c2";
const HASHTAG_SPLIT = /(#[\p{L}\p{N}_]+)/gu;
const HASHTAG_MATCH = /^#[\p{L}\p{N}_]+$/u;

function renderHashtags(text: string): ReactNode[] {
  return text
    .split(HASHTAG_SPLIT)
    .map((part, i) =>
      HASHTAG_MATCH.test(part) ? (
        <span key={i} style={{ color: LINKEDIN_BLUE }} className="font-medium">
          {part}
        </span>
      ) : (
        part
      ),
    );
}

/** A non-interactive, animated illustration of the product for signed-out visitors on the
 * login screen: a mock post, styled like an actual LinkedIn post, moves through the real
 * review pipeline — picked up by a different agent at each stage, formatted from real
 * markdown source, gets a reviewer comment on a specific claim, has that claim corrected, and
 * lands on its scheduled day. */
export function ProductPreview() {
  const [step, setStep] = useState(0);
  const [weekdays] = useState(getCurrentWeekdays);
  const phase = TIMELINE[step];

  useEffect(() => {
    const id = setTimeout(() => setStep((s) => (s + 1) % TIMELINE.length), phase.duration);
    return () => clearTimeout(id);
  }, [step, phase.duration]);

  const activeState = POST_STATES[phase.stateIndex];
  const introFormatted = toLinkedInPreview(INTRO_MD);
  const bulletsFormatted = toLinkedInPreview(BULLETS_BEFORE_CLAIM_MD);

  return (
    <div className="w-full max-w-[420px] rounded-2xl border border-border bg-surface-1 p-6 shadow-card">
      <p className="mb-4 text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">
        An agent drafts. You review.
      </p>

      <div className="mb-4 flex items-center gap-1.5">
        {AGENTS.map((a) => {
          const active = a.id === phase.agent;
          return (
            <span
              key={a.id}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all duration-500 ${
                active ? "border-transparent" : "border-border bg-surface-2 text-text-muted"
              }`}
              style={active ? { background: a.color, color: a.textOnColor } : undefined}
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: active ? a.textOnColor : a.color }}
              />
              {a.label}
            </span>
          );
        })}
      </div>

      {/* Styled like a real LinkedIn post (same chrome/icons as the app's actual preview,
          apps/web/src/components/LinkedInPreview.tsx) — white surface and LinkedIn blue
          regardless of the app's own theme, on purpose. */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex items-start gap-2 px-4 pt-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200 text-gray-400">
            <UserAvatarIcon className="h-8 w-8" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-semibold leading-tight text-gray-900">Marketing Agent</div>
            <div className="truncate text-xs leading-tight text-gray-500">Automating your GTM content</div>
            <div className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
              <span>Now</span>
              <span>·</span>
              <GlobeIcon className="h-3 w-3" />
            </div>
          </div>
        </div>

        <div className="px-4 pb-1 pt-3 text-sm leading-normal text-gray-900">
          <p className="whitespace-pre-wrap">{introFormatted}</p>
          <p className="mt-2 whitespace-pre-wrap">
            {bulletsFormatted}{" "}
            <span
              key={phase.revised ? "revised" : "original"}
              className={`relative rounded px-0.5 py-px transition-colors duration-500 ${
                phase.reviewing
                  ? "animate-preview-pulse bg-accent-soft"
                  : phase.justUpdated
                    ? "animate-preview-flash"
                    : ""
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
          </p>
          <p className="mt-2">{renderHashtags("#ProductUpdates #BuildInPublic")}</p>
        </div>

        <div className="mt-2 flex items-center justify-between px-4 pb-2 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#0a66c2] text-white ring-2 ring-white">
              <ThumbsUpIcon className="h-2.5 w-2.5" strokeWidth={2.5} />
            </span>
            <span className="-ml-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#df704c] text-white ring-2 ring-white">
              ❤
            </span>
            <span className="ml-1">57</span>
          </div>
          <div>24 comments · 6 reposts</div>
        </div>

        <div className="grid grid-cols-4 gap-1 border-t border-gray-100 px-2 py-1">
          {[
            { icon: ThumbsUpIcon, label: "Like" },
            { icon: CommentIcon, label: "Comment" },
            { icon: RepostIcon, label: "Repost" },
            { icon: SendIcon, label: "Send" },
          ].map(({ icon: ActionIcon, label }) => (
            <div
              key={label}
              className="flex items-center justify-center gap-1.5 rounded-md py-2 text-[13px] font-medium text-gray-600"
            >
              <ActionIcon className="h-4 w-4" />
              {label}
            </div>
          ))}
        </div>
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

      <div className="mt-5 rounded-xl border border-border bg-surface-2 p-3">
        <p className="mb-2 text-[11px] font-medium text-text-muted">Scheduled</p>
        <div className="flex justify-between">
          {weekdays.map((date, i) => (
            <div key={date.toISOString()} className="flex flex-col items-center gap-1">
              <span className="text-[9px] font-medium text-text-muted">{WEEKDAY_LETTERS[i]}</span>
              <div
                className={`relative flex h-7 w-7 items-center justify-center rounded-md text-[11px] font-medium transition-colors duration-500 ${
                  i === SCHEDULED_DAY_INDEX ? "bg-accent-soft text-accent-text" : "text-text-secondary"
                }`}
              >
                {date.getDate()}
                {i === SCHEDULED_DAY_INDEX && phase.posted && (
                  <span
                    key="check"
                    className="animate-preview-check-pop absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[rgb(26,127,88)] text-[8px] text-white"
                  >
                    ✓
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
