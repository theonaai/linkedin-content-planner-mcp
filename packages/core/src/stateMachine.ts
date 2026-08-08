import type { PostState, ReviewDecision } from "./types.js";

export const POST_STATES: readonly PostState[] = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "ready",
  "posted",
];

/**
 * Plain state transitions reachable via setPostState. Entering/leaving `in_review`
 * on the review-decision side (in_review -> ready, in_review -> in_progress) is
 * deliberately excluded here — those two edges only happen through submitReview,
 * which also records the approval/changes-requested decision that justifies them.
 */
const PLAIN_TRANSITIONS: Record<PostState, readonly PostState[]> = {
  backlog: ["todo"],
  todo: ["backlog", "in_progress"],
  in_progress: ["todo", "in_review"],
  in_review: [],
  ready: ["in_progress", "posted"],
  posted: [],
};

const REVIEW_TRANSITIONS: Record<ReviewDecision, { from: PostState; to: PostState }> = {
  approved: { from: "in_review", to: "ready" },
  changes_requested: { from: "in_review", to: "in_progress" },
};

export class InvalidStateTransitionError extends Error {
  constructor(from: PostState, to: PostState) {
    super(`Cannot transition post from "${from}" to "${to}"`);
    this.name = "InvalidStateTransitionError";
  }
}

export function canTransition(from: PostState, to: PostState): boolean {
  return PLAIN_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: PostState, to: PostState): void {
  if (!canTransition(from, to)) {
    throw new InvalidStateTransitionError(from, to);
  }
}

export function reviewTransition(decision: ReviewDecision): { from: PostState; to: PostState } {
  return REVIEW_TRANSITIONS[decision];
}

export function assertReviewTransition(currentState: PostState, decision: ReviewDecision): PostState {
  const { from, to } = reviewTransition(decision);
  if (currentState !== from) {
    throw new InvalidStateTransitionError(currentState, to);
  }
  return to;
}
