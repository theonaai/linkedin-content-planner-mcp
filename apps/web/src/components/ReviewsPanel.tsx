import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api.js";
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
    <div>
      {postState === "in_review" && (
        <div className="mb-4 rounded-md border border-purple-200 bg-purple-50 p-3">
          <p className="mb-2 text-xs font-semibold text-purple-800">Review this post</p>
          <textarea
            className="mb-2 w-full rounded-md border border-gray-300 p-2 text-sm"
            rows={2}
            placeholder="Note (required if requesting changes)…"
            value={decisionBody}
            onChange={(e) => setDecisionBody(e.target.value)}
          />
          {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => decide("approved")}
              disabled={submitting}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
            >
              Approve
            </button>
            <button
              onClick={() => decide("changes_requested")}
              disabled={submitting}
              className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
            >
              Request changes
            </button>
          </div>
        </div>
      )}
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Review history</p>
      {loading ? (
        <p className="text-xs text-gray-400">Loading…</p>
      ) : reviews.length === 0 ? (
        <p className="text-xs text-gray-400">No reviews yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {reviews.map((r) => (
            <div
              key={r.id}
              className={`rounded-md border p-2 text-xs ${
                r.decision === "approved" ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{r.decision === "approved" ? "Approved" : "Changes requested"}</span>
                <span className="text-gray-400">{new Date(r.createdAt).toLocaleString()}</span>
              </div>
              {r.body && <p className="mt-1 text-gray-700">{r.body}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
