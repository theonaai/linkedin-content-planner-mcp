export type PostState = "backlog" | "todo" | "in_progress" | "in_review" | "ready" | "posted";
export type Platform = "linkedin" | "substack";
export type ReviewDecision = "approved" | "changes_requested";

export interface Post {
  id: string;
  workspaceId: string;
  platform: Platform;
  state: PostState;
  scheduledDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PostVersion {
  id: string;
  postId: string;
  contentMarkdown: string;
  authorId: string | null;
  createdAt: string;
}

export interface Comment {
  id: string;
  postVersionId: string;
  parentCommentId: string | null;
  anchorOffset: number | null;
  anchorLength: number | null;
  body: string;
  resolved: boolean;
  authorId: string | null;
  createdAt: string;
  /** Anchor position relative to the latest version's content — null when the comment has
   * no anchor, or its anchored text couldn't be relocated there (see anchorStale). */
  resolvedAnchorOffset: number | null;
  resolvedAnchorLength: number | null;
  /** True only when the comment had an anchor that no longer appears unchanged in the
   * latest version — i.e. the text it referred to was edited or removed since. */
  anchorStale: boolean;
}

export interface Review {
  id: string;
  postVersionId: string;
  reviewerId: string | null;
  decision: ReviewDecision;
  body: string | null;
  createdAt: string;
}

export interface DiffOp {
  type: "add" | "remove" | "context";
  value: string;
}
