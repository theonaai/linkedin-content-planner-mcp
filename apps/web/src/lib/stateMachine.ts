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

export const STATE_BADGE_CLASSES: Record<PostState, string> = {
  backlog: "bg-gray-200 text-gray-700",
  todo: "bg-sky-100 text-sky-800",
  in_progress: "bg-amber-100 text-amber-800",
  in_review: "bg-purple-100 text-purple-800",
  ready: "bg-emerald-100 text-emerald-800",
  posted: "bg-slate-800 text-white",
};
