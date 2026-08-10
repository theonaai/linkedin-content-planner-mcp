export type PostState =
  | "backlog"
  | "todo"
  | "in_progress"
  | "in_review"
  | "ready"
  | "posted";

export type Platform = "linkedin" | "substack";

export type ReviewDecision = "approved" | "changes_requested";

export type WebhookEvent =
  | "post.created"
  | "post.state_changed"
  | "post.review_changes_requested"
  | "post.review_approved"
  | "post.comment_added"
  | "post.deleted";
