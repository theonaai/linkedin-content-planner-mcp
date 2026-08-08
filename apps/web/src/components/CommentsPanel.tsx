import { useState } from "react";
import { api } from "../lib/api.js";
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
      className={`rounded-md border p-2 text-xs ${
        comment.resolved ? "border-gray-200 bg-gray-50 opacity-60" : "border-gray-300 bg-white"
      }`}
    >
      {comment.anchorOffset !== null &&
        (comment.anchorStale ? (
          <div
            className="mb-1 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500"
            title="The text this comment referred to has been edited or removed since"
          >
            text changed since this comment
          </div>
        ) : (
          <div className="mb-1 inline-block rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700">
            anchored on preview
          </div>
        ))}
      <p className="text-gray-800">{comment.body}</p>
      <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-400">
        <span>{new Date(comment.createdAt).toLocaleString()}</span>
        <button onClick={() => onResolve(comment)} className="text-blue-600 hover:underline">
          {comment.resolved ? "Unresolve" : "Resolve"}
        </button>
      </div>
      <div className="mt-2 flex flex-col gap-2 border-l-2 border-gray-100 pl-2">
        {replies.map((r) => (
          <div key={r.id} className="text-gray-700">
            <p>{r.body}</p>
            <span className="text-[11px] text-gray-400">{new Date(r.createdAt).toLocaleString()}</span>
          </div>
        ))}
        <div className="flex gap-1">
          <input
            className="flex-1 rounded border border-gray-200 px-1.5 py-1 text-[11px]"
            placeholder="Reply…"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
          />
          <button
            onClick={() => {
              if (replyText.trim()) {
                onReply(replyText.trim());
                setReplyText("");
              }
            }}
            className="rounded bg-gray-100 px-2 text-[11px] text-gray-700 hover:bg-gray-200"
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
    <div>
      <p className="mb-3 text-xs text-gray-500">
        Select text in the LinkedIn preview above to leave a comment anchored to it.
      </p>

      {!generalOpen ? (
        <button
          onClick={() => setGeneralOpen(true)}
          className="mb-3 text-xs text-gray-500 hover:text-gray-700 hover:underline"
        >
          + Add a general comment
        </button>
      ) : (
        <div className="mb-3">
          <textarea
            autoFocus
            rows={2}
            className="w-full rounded-md border border-gray-300 p-2 text-xs"
            placeholder="General comment (not tied to a specific selection)…"
            value={generalText}
            onChange={(e) => setGeneralText(e.target.value)}
          />
          <div className="mt-1 flex justify-end gap-1">
            <button
              onClick={() => {
                setGeneralOpen(false);
                setGeneralText("");
              }}
              className="rounded px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              onClick={submitGeneral}
              disabled={!generalText.trim()}
              className="rounded bg-gray-900 px-2 py-1 text-[11px] text-white disabled:opacity-40"
            >
              Post
            </button>
          </div>
        </div>
      )}

      {roots.length === 0 ? (
        <p className="text-xs text-gray-400">No comments yet.</p>
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
