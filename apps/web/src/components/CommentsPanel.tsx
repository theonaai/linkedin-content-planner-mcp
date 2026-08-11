import { useState } from "react";
import { api } from "../lib/api.js";
import { MAX_COMMENT_BODY_LENGTH } from "../lib/limits.js";
import type { Comment } from "../lib/types.js";

function CommentThread({
  comment,
  replies,
  onResolve,
  onReply,
}: {
  comment: Comment;
  replies: Comment[];
  onResolve: (comment: Comment) => void;
  onReply: (body: string) => void;
}) {
  const [replyText, setReplyText] = useState("");

  return (
    <div
      className={`rounded-xl border p-4 text-xs ${
        comment.resolved ? "border-border bg-surface-2 opacity-60" : "border-border-strong bg-surface-1"
      }`}
    >
      {comment.anchorOffset !== null &&
        (comment.anchorStale ? (
          <div
            className="mb-1.5 inline-block rounded-full bg-surface-3 px-2 py-0.5 text-[11px] text-text-secondary"
            title="The text this comment referred to has been edited or removed since"
          >
            text changed since this comment
          </div>
        ) : (
          <div className="mb-1.5 inline-block rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-accent-text">
            anchored on preview
          </div>
        ))}
      <p className="text-[13px] text-text-primary">{comment.body}</p>
      <div className="mt-2 flex items-center gap-2.5 text-[11px] text-text-muted">
        <span>{new Date(comment.createdAt).toLocaleString()}</span>
        <button onClick={() => onResolve(comment)} className="font-medium text-accent-text hover:underline">
          {comment.resolved ? "Unresolve" : "Resolve"}
        </button>
      </div>
      <div className="mt-3 flex flex-col gap-2.5 border-l-2 border-border pl-3">
        {replies.map((r) => (
          <div key={r.id} className="text-text-secondary">
            <p className="text-[13px]">{r.body}</p>
            <span className="text-[11px] text-text-muted">{new Date(r.createdAt).toLocaleString()}</span>
          </div>
        ))}
        <div className="flex gap-1.5">
          <input
            className="flex-1 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[11px] outline-none focus:border-accent"
            placeholder="Reply…"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            maxLength={MAX_COMMENT_BODY_LENGTH}
          />
          <button
            onClick={() => {
              if (replyText.trim()) {
                onReply(replyText.trim());
                setReplyText("");
              }
            }}
            className="rounded-full bg-surface-3 px-3 text-[11px] font-medium text-text-secondary hover:bg-border-strong"
          >
            Reply
          </button>
        </div>
      </div>
    </div>
  );
}

export function CommentsPanel({
  postVersionId,
  comments,
  onChanged,
}: {
  postVersionId: string;
  comments: Comment[];
  onChanged: () => void;
}) {
  const [generalOpen, setGeneralOpen] = useState(false);
  const [generalText, setGeneralText] = useState("");

  async function submitGeneral() {
    if (!generalText.trim()) return;
    await api.addComment(postVersionId, { body: generalText.trim() });
    setGeneralOpen(false);
    setGeneralText("");
    onChanged();
  }

  async function submitReply(parentCommentId: string, text: string) {
    await api.addComment(postVersionId, { body: text, parentCommentId });
    onChanged();
  }

  async function toggleResolve(comment: Comment) {
    await api.resolveComment(comment.id, !comment.resolved);
    onChanged();
  }

  const roots = comments.filter((c) => !c.parentCommentId);
  const repliesOf = (id: string) => comments.filter((c) => c.parentCommentId === id);

  return (
    <div className="max-w-[720px]">
      <p className="mb-3.5 text-xs text-text-muted">
        Select text in the LinkedIn preview above to leave a comment anchored to it.
      </p>

      {!generalOpen ? (
        <button onClick={() => setGeneralOpen(true)} className="mb-3.5 text-xs text-text-secondary hover:text-text-primary hover:underline">
          + Add a general comment
        </button>
      ) : (
        <div className="mb-3.5">
          <textarea
            autoFocus
            rows={2}
            className="w-full rounded-xl border border-border bg-surface-2 p-3 text-xs outline-none focus:border-accent"
            placeholder="General comment (not tied to a specific selection)…"
            value={generalText}
            onChange={(e) => setGeneralText(e.target.value)}
            maxLength={MAX_COMMENT_BODY_LENGTH}
          />
          <div className="mt-1.5 flex justify-end gap-1.5">
            <button
              onClick={() => {
                setGeneralOpen(false);
                setGeneralText("");
              }}
              className="rounded-full px-3 py-1.5 text-[11px] text-text-secondary hover:bg-surface-2"
            >
              Cancel
            </button>
            <button
              onClick={submitGeneral}
              disabled={!generalText.trim()}
              className="rounded-full bg-accent px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40"
            >
              Post
            </button>
          </div>
        </div>
      )}

      {roots.length === 0 ? (
        <p className="text-xs text-text-muted">No comments yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {roots.map((c) => (
            <CommentThread
              key={c.id}
              comment={c}
              replies={repliesOf(c.id)}
              onResolve={toggleResolve}
              onReply={(text) => submitReply(c.id, text)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
