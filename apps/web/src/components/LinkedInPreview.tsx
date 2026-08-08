import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { toLinkedInPreview } from "@linkedin-planner/formatting";
import { api } from "../lib/api.js";
import type { Comment } from "../lib/types.js";
import { CommentIcon, GlobeIcon, RepostIcon, SendIcon, ThumbsUpIcon, UserAvatarIcon } from "./icons.js";

const LINKEDIN_BLUE = "#0a66c2";
const TEXT_CLASSES = "whitespace-pre-wrap text-sm leading-normal text-gray-900";

const HASHTAG_SPLIT = /(#[\p{L}\p{N}_]+)/gu;
const HASHTAG_MATCH = /^#[\p{L}\p{N}_]+$/u;

interface ResolvedAnchor {
  commentId: string;
  offset: number;
  length: number;
  resolved: boolean;
}

export interface CommentableConfig {
  postVersionId: string;
  /** All comments (roots + replies) on postVersionId — used both to draw highlights and
   * to render the click-to-view thread popover. */
  comments: Comment[];
  onChanged: () => void;
}

type Overlay =
  | { type: "compose"; offset: number; length: number; text: string; top: number; left: number }
  | { type: "thread"; commentId: string; top: number; left: number };

function renderWithHashtags(text: string, keyPrefix: string): ReactNode[] {
  return text.split(HASHTAG_SPLIT).map((part, i) =>
    HASHTAG_MATCH.test(part) ? (
      <span key={`${keyPrefix}-${i}`} style={{ color: LINKEDIN_BLUE }} className="font-medium">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

function renderAnnotated(
  text: string,
  anchors: ResolvedAnchor[],
  keyPrefix: string,
  onMarkClick: (commentId: string, el: HTMLElement) => void,
): ReactNode[] {
  if (anchors.length === 0) return renderWithHashtags(text, keyPrefix);
  const sorted = [...anchors].sort((a, b) => a.offset - b.offset);
  const nodes: ReactNode[] = [];
  let cursor = 0;
  sorted.forEach((a, i) => {
    const start = Math.max(a.offset, cursor);
    const end = a.offset + a.length;
    if (start > cursor) nodes.push(...renderWithHashtags(text.slice(cursor, start), `${keyPrefix}-p${i}`));
    if (end > start) {
      nodes.push(
        <mark
          key={`${keyPrefix}-h${i}`}
          onClick={(e) => onMarkClick(a.commentId, e.currentTarget)}
          className={`cursor-pointer ${a.resolved ? "bg-gray-200 hover:bg-gray-300" : "bg-amber-200/70 hover:bg-amber-300/70"}`}
        >
          {renderWithHashtags(text.slice(start, end), `${keyPrefix}-h${i}t`)}
        </mark>,
      );
    }
    cursor = Math.max(cursor, end);
  });
  if (cursor < text.length) nodes.push(...renderWithHashtags(text.slice(cursor), `${keyPrefix}-tail`));
  return nodes;
}

/** Clips/rebases anchors to the [rangeStart, rangeEnd) window (used to split anchors across
 * the visible/below-the-fold halves, which are separate DOM subtrees). */
function clipAnchors(anchors: ResolvedAnchor[], rangeStart: number, rangeEnd: number): ResolvedAnchor[] {
  return anchors
    .map((a) => {
      const start = Math.max(a.offset, rangeStart);
      const end = Math.min(a.offset + a.length, rangeEnd);
      if (end <= start) return null;
      return { commentId: a.commentId, offset: start - rangeStart, length: end - start, resolved: a.resolved };
    })
    .filter((a): a is ResolvedAnchor => a !== null);
}

/** Binary-searches the character offset where `fullText` would wrap onto a 4th line,
 * using a same-width/font hidden element as the ruler. Returns null if it already fits. */
function findClampCutoff(measureEl: HTMLDivElement, fullText: string, maxHeight: number): number | null {
  measureEl.textContent = fullText;
  if (measureEl.getBoundingClientRect().height <= maxHeight + 1) return null;

  let lo = 0;
  let hi = fullText.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    measureEl.textContent = fullText.slice(0, mid);
    const fits = measureEl.getBoundingClientRect().height <= maxHeight + 1;
    if (fits) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function LinkedInPreview({ content, commentable }: { content: string; commentable?: CommentableConfig }) {
  const formatted = toLinkedInPreview(content);
  const clampRulerRef = useRef<HTMLDivElement>(null);
  const measureRulerRef = useRef<HTMLDivElement>(null);
  const contentAreaRef = useRef<HTMLDivElement>(null);
  const visibleRef = useRef<HTMLDivElement>(null);
  const hiddenRef = useRef<HTMLDivElement>(null);
  const [cutoff, setCutoff] = useState<number | null>(null);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [composerText, setComposerText] = useState("");
  const [replyText, setReplyText] = useState("");

  useLayoutEffect(() => {
    const clampEl = clampRulerRef.current;
    const measureEl = measureRulerRef.current;
    if (!clampEl || !measureEl || !formatted) {
      setCutoff(null);
      return;
    }
    setCutoff(findClampCutoff(measureEl, formatted, clampEl.clientHeight));
  }, [formatted]);

  useEffect(() => {
    setOverlay(null);
    setComposerText("");
    setReplyText("");
  }, [content]);

  useEffect(() => {
    if (!overlay) return;
    function onDocMouseDown(e: MouseEvent) {
      if (contentAreaRef.current && !contentAreaRef.current.contains(e.target as Node)) {
        setOverlay(null);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [overlay]);

  function handleMouseUp(containerRef: React.RefObject<HTMLDivElement | null>, baseOffset: number) {
    if (!commentable || overlay?.type === "compose") return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !containerRef.current || sel.rangeCount === 0) {
      if (overlay?.type !== "thread") setOverlay(null);
      return;
    }
    const range = sel.getRangeAt(0);
    if (!containerRef.current.contains(range.commonAncestorContainer)) {
      setOverlay(null);
      return;
    }
    const text = range.toString();
    if (!text) {
      setOverlay(null);
      return;
    }
    const preRange = document.createRange();
    preRange.selectNodeContents(containerRef.current);
    preRange.setEnd(range.startContainer, range.startOffset);
    const rect = range.getBoundingClientRect();
    const areaRect = contentAreaRef.current!.getBoundingClientRect();
    setOverlay({
      type: "compose",
      offset: baseOffset + preRange.toString().length,
      length: text.length,
      text,
      top: rect.top - areaRect.top,
      left: Math.max(0, rect.left - areaRect.left),
    });
  }

  function handleMarkClick(commentId: string, el: HTMLElement) {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString()) return;
    if (!contentAreaRef.current) return;
    const rect = el.getBoundingClientRect();
    const areaRect = contentAreaRef.current.getBoundingClientRect();
    setReplyText("");
    setOverlay({
      type: "thread",
      commentId,
      top: rect.bottom - areaRect.top,
      left: Math.max(0, rect.left - areaRect.left),
    });
  }

  async function submitCompose() {
    if (!commentable || overlay?.type !== "compose" || !composerText.trim()) return;
    await api.addComment(commentable.postVersionId, {
      body: composerText.trim(),
      anchorOffset: overlay.offset,
      anchorLength: overlay.length,
    });
    setOverlay(null);
    setComposerText("");
    window.getSelection()?.removeAllRanges();
    commentable.onChanged();
  }

  async function submitReply(commentId: string) {
    if (!commentable || !replyText.trim()) return;
    await api.addComment(commentable.postVersionId, { body: replyText.trim(), parentCommentId: commentId });
    setReplyText("");
    commentable.onChanged();
  }

  async function toggleResolve(comment: Comment) {
    if (!commentable) return;
    await api.resolveComment(comment.id, !comment.resolved);
    commentable.onChanged();
  }

  const visibleText = cutoff === null ? formatted : formatted.slice(0, cutoff);
  const hiddenText = cutoff === null ? "" : formatted.slice(cutoff);
  const anchors: ResolvedAnchor[] = (commentable?.comments ?? [])
    .filter((c) => !c.parentCommentId && c.resolvedAnchorOffset !== null)
    .map((c) => ({
      commentId: c.id,
      offset: c.resolvedAnchorOffset!,
      length: c.resolvedAnchorLength ?? 0,
      resolved: c.resolved,
    }));
  const visibleAnchors = clipAnchors(anchors, 0, cutoff ?? formatted.length);
  const hiddenAnchors = cutoff !== null ? clipAnchors(anchors, cutoff, formatted.length) : [];

  const threadComment =
    overlay?.type === "thread" ? commentable?.comments.find((c) => c.id === overlay.commentId) : undefined;
  const threadReplies = threadComment
    ? (commentable?.comments ?? []).filter((c) => c.parentCommentId === threadComment.id)
    : [];

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex items-start gap-2 px-4 pt-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200 text-gray-400">
          <UserAvatarIcon className="h-9 w-9" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold leading-tight text-gray-900">Your Name</div>
          <div className="truncate text-xs leading-tight text-gray-500">Your headline</div>
          <div className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
            <span>Now</span>
            <span>·</span>
            <GlobeIcon className="h-3 w-3" />
          </div>
        </div>
      </div>

      <div ref={contentAreaRef} className="relative px-4 pb-1 pt-3">
        {/* Invisible rulers, laid out at the same width as the visible text, used only to
            measure where LinkedIn's real 3-line clamp would cut this content. */}
        <div ref={clampRulerRef} aria-hidden className={`${TEXT_CLASSES} invisible absolute inset-x-4 top-0 -z-10 line-clamp-3`}>
          {formatted}
        </div>
        <div ref={measureRulerRef} aria-hidden className={`${TEXT_CLASSES} invisible absolute inset-x-4 top-0 -z-10`} />

        {formatted ? (
          <>
            <div className="relative">
              <div
                ref={visibleRef}
                onMouseUp={() => handleMouseUp(visibleRef, 0)}
                className={commentable ? `${TEXT_CLASSES} cursor-text` : TEXT_CLASSES}
              >
                {renderAnnotated(visibleText, visibleAnchors, "v", handleMarkClick)}
              </div>
              {cutoff !== null && (
                <span className="absolute bottom-0 right-0 bg-white pl-1 text-sm font-medium text-gray-500">
                  …more
                </span>
              )}
            </div>
            {cutoff !== null && (
              <>
                <div className="my-2 border-t border-dashed border-gray-300" />
                <div
                  ref={hiddenRef}
                  onMouseUp={() => handleMouseUp(hiddenRef, cutoff)}
                  className={commentable ? `${TEXT_CLASSES} cursor-text` : TEXT_CLASSES}
                >
                  {renderAnnotated(hiddenText, hiddenAnchors, "h", handleMarkClick)}
                </div>
              </>
            )}

            {overlay?.type === "compose" && (
              <div
                style={{ top: Math.max(0, overlay.top - 34), left: overlay.left }}
                className="absolute z-10 w-72 rounded-md border border-gray-200 bg-white p-2 shadow-lg"
              >
                <p className="mb-1 truncate text-[11px] text-gray-500">
                  On: “{overlay.text.length > 50 ? `${overlay.text.slice(0, 50)}…` : overlay.text}”
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
                      setOverlay(null);
                      setComposerText("");
                    }}
                    className="rounded px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitCompose}
                    disabled={!composerText.trim()}
                    className="rounded bg-gray-900 px-2 py-1 text-[11px] text-white disabled:opacity-40"
                  >
                    Post
                  </button>
                </div>
              </div>
            )}

            {overlay?.type === "thread" && threadComment && (
              <div
                style={{ top: overlay.top + 4, left: overlay.left }}
                className="absolute z-10 w-72 rounded-md border border-gray-200 bg-white p-2 shadow-lg"
              >
                <p className="text-xs text-gray-800">{threadComment.body}</p>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-400">
                  <span>{new Date(threadComment.createdAt).toLocaleString()}</span>
                  <button onClick={() => toggleResolve(threadComment)} className="text-blue-600 hover:underline">
                    {threadComment.resolved ? "Unresolve" : "Resolve"}
                  </button>
                </div>
                {threadReplies.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1.5 border-t border-gray-100 pt-2">
                    {threadReplies.map((r) => (
                      <div key={r.id} className="text-[11px] text-gray-700">
                        <p>{r.body}</p>
                        <span className="text-gray-400">{new Date(r.createdAt).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-2 flex gap-1">
                  <input
                    className="flex-1 rounded border border-gray-200 px-1.5 py-1 text-[11px]"
                    placeholder="Reply…"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                  />
                  <button
                    onClick={() => submitReply(threadComment.id)}
                    disabled={!replyText.trim()}
                    className="rounded bg-gray-100 px-2 text-[11px] text-gray-700 hover:bg-gray-200 disabled:opacity-40"
                  >
                    Reply
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm italic text-gray-400">Nothing to preview yet.</p>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between px-4 pb-2 text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#0a66c2] text-white ring-2 ring-white">
            <ThumbsUpIcon className="h-2.5 w-2.5" strokeWidth={2.5} />
          </span>
          <span className="-ml-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#df704c] text-white ring-2 ring-white">
            ❤
          </span>
          <span className="ml-1">57</span>
        </div>
        <div>24 comments · 6 reposts</div>
      </div>

      <div className="grid grid-cols-4 gap-1 border-t border-gray-100 px-2 py-1">
        {[
          { icon: ThumbsUpIcon, label: "Like" },
          { icon: CommentIcon, label: "Comment" },
          { icon: RepostIcon, label: "Repost" },
          { icon: SendIcon, label: "Send" },
        ].map(({ icon: ActionIcon, label }) => (
          <button
            key={label}
            className="flex items-center justify-center gap-1.5 rounded-md py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            <ActionIcon className="h-5 w-5" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
