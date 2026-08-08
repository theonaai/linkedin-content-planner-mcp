export type PostState =
  | "backlog"
  | "todo"
  | "in_progress"
  | "in_review"
  | "ready"
  | "posted";

export type Platform = "linkedin" | "substack";

export type ReviewDecision = "approved" | "changes_requested";
