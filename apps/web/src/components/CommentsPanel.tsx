import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../lib/api.js";
import type { Comment } from "../lib/types.js";

interface PendingSelection {
  offset: number;
  length: number;
  text: string;
  top: number;
  left: number;
}

function renderHighlighted(
  text: string,
  anchors: { offset: number; length: number; resolved: boolean }[],
): ReactNode[] {
  if (anchors.length === 0) return [text];
  const sorted = [...anchors].sort((a, b) => a.offset - b.offset);
  const nodes: ReactNode[] = [];
  let cursor = 0;
  sorted.forEach((a, i) => {
    const start = Math.max(a.offset, cursor);
    const end = a.offset + a.length;
    if (start > cursor) nodes.push(text.slice(cursor, start));
    if (end > start) {
      nodes.push(
        <mark key={i} className={a.resolved ? "bg-gray-200" : "bg-amber-200/70"}>
          {text.slice(start, end)}
        </mark>,
      );
    }
    cursor = Math.max(cursor, end);
  });
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
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
  const [pending, setPending] = useState<PendingSelection | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerText, setComposerText] = useState("");
  const [generalOpen, setGeneralOpen] = useState(false);
  const [generalText, setGeneralText] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);
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
    setPending(null);
    setComposerOpen(false);
    load();
  }, [load]);

  // Close the floating button/composer when clicking anywhere outside the content + popover.
  useEffect(() => {
    if (!pending) return;
    function onDocMouseDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setPending(null);
        setComposerOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [pending]);

  function handleMouseUp() {
    if (composerOpen) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !contentRef.current || sel.rangeCount === 0) {
      setPending(null);
      return;
    }
    const range = sel.getRangeAt(0);
    if (!contentRef.current.contains(range.commonAncestorContainer)) {
      setPending(null);
      return;
    }
    const text = range.toString();
    if (!text) {
      setPending(null);
      return;
    }
    const preRange = document.createRange();
    preRange.selectNodeContents(contentRef.current);
    preRange.setEnd(range.startContainer, range.startOffset);
    const rect = range.getBoundingClientRect();
    const containerRect = contentRef.current.getBoundingClientRect();
    setPending({
      offset: preRange.toString().length,
      length: text.length,
      text,
      top: rect.top - containerRect.top,
      left: Math.max(0, rect.left - containerRect.left),
    });
  }

  async function submitPending() {
    if (!pending || !composerText.trim()) return;
    await api.addComment(postVersionId, {
      body: composerText.trim(),
      anchorOffset: pending.offset,
      anchorLength: pending.length,
    });
    setPending(null);
    setComposerOpen(false);
    setComposerText("");
    window.getSelection()?.removeAllRanges();
    await load();
  }

  async function submitGeneral() {
    if (!generalText.trim()) return;
    await api.addComment(postVersionId, { body: generalText.trim() });
    setGeneralOpen(false);
    setGeneralText("");
    await load();
  }

  async function submitReply(parentCommentId: string, text: string) {
    await api.addComment(postVersionId, { body: text, parentCommentId });
    await load();
  }

  async function toggleResolve(comment: Comment) {
    await api.resolveComment(comment.id, !comment.resolved);
    await load();
  }

  const roots = comments.filter((c) => !c.parentCommentId);
  const repliesOf = (id: string) => comments.filter((c) => c.parentCommentId === id);
  const anchors = roots
    .filter((c) => c.anchorOffset !== null)
    .map((c) => ({ offset: c.anchorOffset!, length: c.anchorLength ?? 0, resolved: c.resolved }));

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Content — select text to comment on it
        </p>
        <div ref={wrapperRef} className="relative">
          <pre
            ref={contentRef}
            onMouseUp={handleMouseUp}
            className="whitespace-pre-wrap rounded-md border border-gray-200 bg-white p-3 font-mono text-sm"
          >
            {renderHighlighted(content, anchors)}
          </pre>

          {pending && !composerOpen && (
            <button
              style={{ top: Math.max(0, pending.top - 34), left: pending.left }}
              className="absolute z-10 flex items-center gap-1 rounded-md bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg hover:bg-gray-800"
              onClick={() => setComposerOpen(true)}
            >
              💬 Comment
            </button>
          )}

          {pending && composerOpen && (
            <div
              style={{ top: Math.max(0, pending.top - 34), left: pending.left }}
              className="absolute z-10 w-72 rounded-md border border-gray-200 bg-white p-2 shadow-lg"
            >
              <p className="mb-1 truncate text-[11px] text-gray-500">
                On: “{pending.text.length > 50 ? `${pending.text.slice(0, 50)}…` : pending.text}”
              </p>
              <textarea
                autoFocus
                rows={2}
                className="w-full rounded border border-gray-300 p-1.5 text-xs"
                placeholder="Add a comment…"
                value={composerText}
                onChange={(e) => setComposerText(e.target.value)}
              />
              <div className="mt-1 flex justify-end gap-1">
                <button
                  onClick={() => {
                    setPending(null);
                    setComposerOpen(false);
                    setComposerText("");
                  }}
                  className="rounded px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  onClick={submitPending}
                  disabled={!composerText.trim()}
                  className="rounded bg-gray-900 px-2 py-1 text-[11px] text-white disabled:opacity-40"
                >
                  Post
                </button>
              </div>
            </div>
          )}
        </div>

        {!generalOpen ? (
          <button
            onClick={() => setGeneralOpen(true)}
            className="mt-2 text-xs text-gray-500 hover:text-gray-700 hover:underline"
          >
            + Add a general comment
          </button>
        ) : (
          <div className="mt-2">
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
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Comments</p>
        {loading ? (
          <p className="text-xs text-gray-400">Loading…</p>
        ) : roots.length === 0 ? (
          <p className="text-xs text-gray-400">No comments yet. Select text on the left to add one.</p>
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
    </div>
  );
}
