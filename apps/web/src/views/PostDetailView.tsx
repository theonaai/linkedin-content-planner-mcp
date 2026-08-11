import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api.js";
import { NEXT_STATES, STATE_LABELS } from "../lib/stateMachine.js";
import { formatDateDisplay } from "../lib/dates.js";
import { useAutosizeTextarea } from "../lib/useAutosizeTextarea.js";
import { MAX_CONTENT_LENGTH } from "../lib/limits.js";
import { StateBadge } from "../components/StateBadge.js";
import { LinkedInPreview } from "../components/LinkedInPreview.js";
import { VersionsPanel } from "../components/VersionsPanel.js";
import { CommentsPanel } from "../components/CommentsPanel.js";
import { ReviewsPanel } from "../components/ReviewsPanel.js";
import { AttachmentsPanel } from "../components/AttachmentsPanel.js";
import { ScheduleDialog } from "../components/ScheduleDialog.js";
import { Modal } from "../components/Modal.js";
import type { Comment, Post, PostVersion } from "../lib/types.js";

type Tab = "versions" | "comments" | "reviews" | "attachments";

const TABS: { id: Tab; label: string }[] = [
  { id: "versions", label: "Versions" },
  { id: "comments", label: "Comments" },
  { id: "reviews", label: "Reviews" },
  { id: "attachments", label: "Attachments" },
];

export function PostDetailView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [post, setPost] = useState<Post | null>(null);
  const [versions, setVersions] = useState<PostVersion[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>("versions");
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useAutosizeTextarea(textareaRef, draft);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [loadedPost, loadedVersions] = await Promise.all([api.getPost(id), api.listVersions(id)]);
      setPost(loadedPost);
      setVersions(loadedVersions);
      setDraft(loadedVersions[loadedVersions.length - 1]?.contentMarkdown ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Snap the versions tab's selection back to latest whenever the version count changes
  // (new draft saved, or a revert happened) — an explicit click on an older version still wins
  // within the current view.
  useEffect(() => {
    if (versions.length > 0) {
      setSelectedVersionId(versions[versions.length - 1].id);
    }
  }, [versions.length]);

  // Comments span every version of the post — carried forward onto the latest version's
  // content wherever their anchored text is unchanged (like git blame following a line).
  const loadComments = useCallback(async () => {
    if (!id) return;
    setComments(await api.listCommentsForPost(id));
  }, [id]);

  // Re-resolve comment anchors whenever the version count changes (new version saved, or a
  // revert) — the previously-fetched anchors were remapped against the *old* latest version
  // and would otherwise render against the new content at the wrong position.
  useEffect(() => {
    loadComments();
  }, [loadComments, versions.length]);

  async function handleTransition(toState: Post["state"]) {
    if (!post) return;
    try {
      await api.setPostState(post.id, toState);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleSaveDraft() {
    if (!post) return;
    setSaving(true);
    setError(null);
    try {
      await api.updateContent(post.id, draft);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleScheduleSave(date: string) {
    if (!post) return;
    await api.setPostDate(post.id, date);
    await load();
  }

  async function handleScheduleRemove() {
    if (!post) return;
    await api.setPostDate(post.id, null);
    await load();
  }

  async function handleDelete() {
    if (!post) return;
    setDeleting(true);
    try {
      await api.deletePost(post.id);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  }

  if (loading) return <p className="text-sm text-text-muted">Loading…</p>;
  if (!post) return <p className="text-sm text-red-600">{error ?? "Post not found"}</p>;

  const latestVersion = versions[versions.length - 1];
  const dirty = draft !== (latestVersion?.contentMarkdown ?? "");
  const commentable =
    !dirty && latestVersion
      ? { postVersionId: latestVersion.id, comments, onChanged: loadComments }
      : undefined;
  const unresolvedCount = comments.filter((c) => !c.parentCommentId && !c.resolved).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <Link to="/" className="inline-block text-sm text-text-secondary hover:text-text-primary">
          ← Back to backlog
        </Link>
        <button onClick={() => setDeleteDialogOpen(true)} className="text-sm font-medium text-accent-text hover:underline">
          Delete post
        </button>
      </div>

      <div className="flex flex-col gap-5 rounded-2xl border border-border bg-surface-1 p-6 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex flex-col gap-3.5">
            <div className="flex items-center gap-2.5">
              <StateBadge state={post.state} />
              <span className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium text-text-secondary">
                {post.platform}
              </span>
            </div>
            {post.scheduledDate ? (
              <div className="flex items-center gap-2 self-start rounded-full bg-accent-soft py-1.5 pl-4 pr-1.5 text-sm text-accent-text">
                <span>📅 Scheduled for {formatDateDisplay(post.scheduledDate)}</span>
                <button
                  onClick={() => setScheduleDialogOpen(true)}
                  className="rounded-full px-2.5 py-1 text-xs font-semibold text-accent-text hover:bg-white/50"
                >
                  Edit
                </button>
              </div>
            ) : (
              <button
                onClick={() => setScheduleDialogOpen(true)}
                className="self-start rounded-full border border-border-strong bg-surface-1 px-4 py-2 text-[13px] font-medium text-text-primary hover:bg-surface-2"
              >
                📅 Schedule post
              </button>
            )}
          </div>
          {NEXT_STATES[post.state].length > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {NEXT_STATES[post.state].map((next) => {
                const blocked = next === "in_review" && unresolvedCount > 0;
                return (
                  <button
                    key={next}
                    onClick={() => handleTransition(next)}
                    disabled={blocked}
                    title={blocked ? `Resolve ${unresolvedCount} open comment(s) first` : undefined}
                    className="rounded-full border border-border-strong bg-surface-1 px-4 py-2 text-[13px] font-medium text-text-primary hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface-1"
                  >
                    Move to {STATE_LABELS[next]} →
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {NEXT_STATES[post.state].includes("in_review") && unresolvedCount > 0 && (
          <p className="-mt-3 text-xs text-accent-text">
            Resolve {unresolvedCount} open comment{unresolvedCount === 1 ? "" : "s"} before submitting for review.
          </p>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-3.5">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">Draft</p>
            <textarea
              ref={textareaRef}
              className="min-h-32 w-full resize-none overflow-hidden rounded-xl border border-border bg-surface-2 p-5 font-mono text-sm leading-relaxed text-text-primary outline-none focus:border-accent focus:bg-surface-1 focus:ring-4 focus:ring-accent-soft"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Draft content (markdown subset: **bold**, *italic*, bullets)…"
              maxLength={MAX_CONTENT_LENGTH}
            />
            <div className="flex items-center gap-4">
              <button
                onClick={handleSaveDraft}
                disabled={!dirty || saving}
                className="rounded-full bg-accent px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save as new version"}
              </button>
              <span className="text-xs text-text-muted">{versions.length} version(s)</span>
              <div className="flex-1" />
              <span
                className={`text-xs tabular-nums ${
                  draft.length > MAX_CONTENT_LENGTH * 0.95 ? "text-accent-text" : "text-text-muted"
                }`}
              >
                {draft.length.toLocaleString()} / {MAX_CONTENT_LENGTH.toLocaleString()}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-3.5">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">
              LinkedIn preview {commentable && "— select text to comment on it"}
            </p>
            {dirty && <p className="text-xs text-accent-text">Save your draft to enable commenting on it.</p>}
            <LinkedInPreview content={draft} commentable={commentable} />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface-1 shadow-card">
        <div className="flex items-center gap-1 border-b border-border px-6">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`-mb-px border-b-2 px-3.5 py-4 text-sm ${
                tab === t.id
                  ? "border-accent font-semibold text-text-primary"
                  : "border-transparent font-medium text-text-muted hover:text-text-secondary"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-6">
        {tab === "versions" && (
          <VersionsPanel
            postId={post.id}
            versions={versions}
            selectedVersionId={selectedVersionId}
            onSelectVersion={setSelectedVersionId}
            onReverted={load}
          />
        )}
        {tab === "comments" && latestVersion && (
          <CommentsPanel postVersionId={latestVersion.id} comments={comments} onChanged={loadComments} />
        )}
        {tab === "reviews" && <ReviewsPanel postId={post.id} postState={post.state} onReviewed={load} />}
        {tab === "attachments" && <AttachmentsPanel postId={post.id} />}
        </div>
      </div>

      {scheduleDialogOpen && (
        <ScheduleDialog
          currentDate={post.scheduledDate}
          onSave={handleScheduleSave}
          onRemove={handleScheduleRemove}
          onClose={() => setScheduleDialogOpen(false)}
        />
      )}

      {deleteDialogOpen && (
        <Modal title="Delete post" onClose={() => setDeleteDialogOpen(false)}>
          <p className="text-sm text-text-secondary">
            This permanently deletes the post, every version, all comments and reviews, and any
            attachments. This can&apos;t be undone.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleting}
              className="rounded-full border border-border-strong px-4 py-2 text-[13px] font-medium text-text-primary hover:bg-surface-2"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-full bg-red-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-red-700 disabled:opacity-40"
            >
              {deleting ? "Deleting…" : "Delete permanently"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
