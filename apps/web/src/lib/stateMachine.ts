import type { PostState } from "./types.js";

/** Mirrors packages/core/src/stateMachine.ts for UI affordances. Server is authoritative. */
export const NEXT_STATES: Record<PostState, PostState[]> = {
  backlog: ["todo"],
  todo: ["backlog", "in_progress"],
  in_progress: ["todo", "in_review"],
  in_review: [],
  ready: ["in_progress", "posted"],
  posted: [],
};

export const POST_STATES: PostState[] = ["backlog", "todo", "in_progress", "in_review", "ready", "posted"];

export const STATE_LABELS: Record<PostState, string> = {
  backlog: "Backlog",
  todo: "To do",
  in_progress: "In progress",
  in_review: "In review",
  ready: "Ready",
  posted: "Posted",
};

interface StateColorSet {
  /** Pill badge: soft background + matching text (StateBadge). */
  badge: string;
  /** Card/chip treatment: soft background, border, and a colored left edge — used for
   * calendar chips and kanban cards alike, matching the design's status-card pattern. */
  card: string;
  /** Small uppercase column-header label color (kanban column headings). */
  label: string;
}

const INK: StateColorSet = {
  badge: "bg-[rgba(19,18,17,0.06)] text-[rgba(19,18,17,0.55)]",
  card: "bg-[rgba(19,18,17,0.035)] border-[rgba(19,18,17,0.10)] border-l-[rgba(19,18,17,0.30)]",
  label: "text-[rgba(19,18,17,0.55)]",
};

export const STATE_COLORS: Record<PostState, StateColorSet> = {
  backlog: INK,
  todo: INK,
  in_progress: {
    badge: "bg-[rgba(229,81,43,0.09)] text-[rgb(193,58,25)]",
    card: "bg-[rgba(229,81,43,0.09)] border-[rgba(229,81,43,0.26)] border-l-[rgb(229,81,43)]",
    label: "text-[rgb(193,58,25)]",
  },
  in_review: {
    badge: "bg-[rgba(122,90,201,0.10)] text-[rgb(97,68,173)]",
    card: "bg-[rgba(122,90,201,0.10)] border-[rgba(122,90,201,0.28)] border-l-[rgb(122,90,201)]",
    label: "text-[rgb(97,68,173)]",
  },
  ready: {
    badge: "bg-[rgba(26,127,88,0.10)] text-[rgb(20,105,72)]",
    card: "bg-[rgba(26,127,88,0.10)] border-[rgba(26,127,88,0.28)] border-l-[rgb(26,127,88)]",
    label: "text-[rgb(20,105,72)]",
  },
  posted: {
    badge: "bg-[rgba(38,102,178,0.09)] text-[rgb(30,86,153)]",
    card: "bg-[rgba(38,102,178,0.09)] border-[rgba(38,102,178,0.26)] border-l-[rgb(38,102,178)]",
    label: "text-[rgb(30,86,153)]",
  },
};

/** Pill badge classes (StateBadge). */
export const STATE_BADGE_CLASSES: Record<PostState, string> = Object.fromEntries(
  POST_STATES.map((s) => [s, STATE_COLORS[s].badge]),
) as Record<PostState, string>;

/** bg + border + colored left-edge, for calendar chips and kanban cards. */
export const STATE_CARD_CLASSES: Record<PostState, string> = Object.fromEntries(
  POST_STATES.map((s) => [s, STATE_COLORS[s].card]),
) as Record<PostState, string>;
