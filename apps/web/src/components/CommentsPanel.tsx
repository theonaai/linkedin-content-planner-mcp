import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import type { Comment } from "../lib/types.js";

interface Selection {
  offset: number;
  length: number;
  text: string;
}

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
      {comment.anchorOffset !== null && (
        <div className="mb-1 inline-block rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700">
          anchored to selection
        </div>
      )}
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

export function CommentsPanel({ postVersionId, content }: { postVersionId: string; content: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [body, setBody] = useState("");
  const contentRef = useRef<HTMLPreElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setComments(await api.listComments(postVersionId));
    } finally {
      setLoading(false);
    }
  }, [postVersionId]);

  useEffect(() => {
    setSelection(null);
    load();
  }, [load]);

  function handleMouseUp() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !contentRef.current || sel.rangeCount === 0) {
      setSelection(null);
      return;
    }
    const range = sel.getRangeAt(0);
    if (!contentRef.current.contains(range.commonAncestorContainer)) {
      setSelection(null);
      return;
    }
    const text = range.toString();
    if (!text) {
      setSelection(null);
      return;
    }
    const preRange = document.createRange();
    preRange.selectNodeContents(contentRef.current);
    preRange.setEnd(range.startContainer, range.startOffset);
    setSelection({ offset: preRange.toString().length, length: text.length, text });
  }

  async function submitComment(parentCommentId?: string, replyBody?: string) {
    const text = replyBody ?? body;
    if (!text.trim()) return;
    await api.addComment(postVersionId, {
      body: text.trim(),
      anchorOffset: !parentCommentId ? selection?.offset : undefined,
      anchorLength: !parentCommentId ? selection?.length : undefined,
      parentCommentId,
    });
    if (!parentCommentId) {
      setBody("");
      setSelection(null);
    }
    await load();
  }

  async function toggleResolve(comment: Comment) {
    await api.resolveComment(comment.id, !comment.resolved);
    await load();
  }

  const roots = comments.filter((c) => !c.parentCommentId);
  const repliesOf = (id: string) => comments.filter((c) => c.parentCommentId === id);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Content (select text to anchor a comment to it)
        </p>
        <pre
          ref={contentRef}
          onMouseUp={handleMouseUp}
          className="whitespace-pre-wrap rounded-md border border-gray-200 bg-white p-3 font-mono text-sm"
        >
          {content}
        </pre>
        {selection && (
          <div className="mt-2 rounded-md bg-amber-50 p-2 text-xs text-amber-800">
            Selected: “{selection.text.length > 60 ? `${selection.text.slice(0, 60)}…` : selection.text}”
            <button onClick={() => setSelection(null)} className="ml-2 underline">
              clear
            </button>
          </div>
        )}
        <textarea
          className="mt-2 w-full rounded-md border border-gray-300 p-2 text-sm"
          rows={2}
          placeholder={selection ? "Comment on selected text…" : "General comment…"}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <button
          onClick={() => submitComment()}
          disabled={!body.trim()}
          className="mt-1 rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
        >
          Add comment
        </button>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Comments</p>
        {loading ? (
          <p className="text-xs text-gray-400">Loading…</p>
        ) : roots.length === 0 ? (
          <p className="text-xs text-gray-400">No comments yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {roots.map((c) => (
              <CommentThread
                key={c.id}
                comment={c}
                replies={repliesOf(c.id)}
                onResolve={toggleResolve}
                onReply={(text) => submitComment(c.id, text)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
