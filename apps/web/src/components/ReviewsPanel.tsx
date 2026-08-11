import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { MAX_REVIEW_BODY_LENGTH } from "../lib/limits.js";
import type { PostState, Review, ReviewDecision } from "../lib/types.js";

export function ReviewsPanel({
  postId,
  postState,
  onReviewed,
}: {
  postId: string;
  postState: PostState;
  onReviewed: () => void;
}) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [decisionBody, setDecisionBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReviews(await api.listReviews(postId));
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(decision: ReviewDecision) {
    if (decision === "changes_requested" && !decisionBody.trim()) {
      setError("A note is required when requesting changes.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.submitReview(postId, decision, decisionBody.trim() || undefined);
      setDecisionBody("");
      await load();
      onReviewed();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-[720px]">
      {postState === "in_review" && (
        <div className="mb-5 rounded-xl border border-[rgba(229,81,43,0.25)] bg-accent-soft p-4">
          <p className="mb-2.5 text-xs font-semibold text-accent-text">Review this post</p>
          <textarea
            className="mb-2.5 w-full rounded-lg border border-border bg-surface-1 p-2.5 text-sm outline-none focus:border-accent"
            rows={2}
            placeholder="Note (required if requesting changes)…"
            value={decisionBody}
            onChange={(e) => setDecisionBody(e.target.value)}
            maxLength={MAX_REVIEW_BODY_LENGTH}
          />
          {error && <p className="mb-2.5 text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => decide("approved")}
              disabled={submitting}
              className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-40"
            >
              Approve
            </button>
            <button
              onClick={() => decide("changes_requested")}
              disabled={submitting}
              className="rounded-full border border-border-strong bg-surface-1 px-4 py-2 text-xs font-medium text-text-primary hover:bg-surface-2 disabled:opacity-40"
            >
              Request changes
            </button>
          </div>
        </div>
      )}
      <p className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">Review history</p>
      {loading ? (
        <p className="text-xs text-text-muted">Loading…</p>
      ) : reviews.length === 0 ? (
        <p className="text-xs text-text-muted">No reviews yet.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {reviews.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-4 rounded-xl border border-border p-4 text-xs">
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-text-primary">
                  {r.decision === "approved" ? "Approved" : "Changes requested"}
                </span>
                {r.body && <p className="text-text-secondary">{r.body}</p>}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                    r.decision === "approved"
                      ? "border border-border bg-surface-2 text-text-secondary"
                      : "border border-[rgba(229,81,43,0.25)] bg-accent-soft text-accent-text"
                  }`}
                >
                  {r.decision === "approved" ? "Approved" : "Changes requested"}
                </span>
                <span className="text-text-muted">{new Date(r.createdAt).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
