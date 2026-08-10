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

  if (loading) return <p className="text-sm text-gray-500">Loading…</p>;
  if (!post) return <p className="text-sm text-red-600">{error ?? "Post not found"}</p>;

  const latestVersion = versions[versions.length - 1];
  const dirty = draft !== (latestVersion?.contentMarkdown ?? "");
  const commentable =
    !dirty && latestVersion
      ? { postVersionId: latestVersion.id, comments, onChanged: loadComments }
      : undefined;
  const unresolvedCount = comments.filter((c) => !c.parentCommentId && !c.resolved).length;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <Link to="/" className="inline-block text-sm text-gray-500 hover:underline">
          ← Back to backlog
        </Link>
        <button
          onClick={() => setDeleteDialogOpen(true)}
          className="text-sm text-red-600 hover:underline"
        >
          Delete post
        </button>
      </div>

      <div className="rounded-lg bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <StateBadge state={post.state} />
            <span className="text-xs text-gray-400">{post.platform}</span>
          </div>
          {post.scheduledDate ? (
            <div className="flex items-center gap-2 rounded-full bg-emerald-50 py-1 pl-3 pr-1 text-sm text-emerald-800">
              <span>📅 Scheduled for {formatDateDisplay(post.scheduledDate)}</span>
              <button
                onClick={() => setScheduleDialogOpen(true)}
                className="rounded-full px-2 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
              >
                Edit
              </button>
            </div>
          ) : (
            <button
              onClick={() => setScheduleDialogOpen(true)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              📅 Schedule post
            </button>
          )}
        </div>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        {NEXT_STATES[post.state].length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {NEXT_STATES[post.state].map((next) => {
              const blocked = next === "in_review" && unresolvedCount > 0;
              return (
                <button
                  key={next}
                  onClick={() => handleTransition(next)}
                  disabled={blocked}
                  title={blocked ? `Resolve ${unresolvedCount} open comment(s) first` : undefined}
                  className="rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  Move to {STATE_LABELS[next]}
                </button>
              );
            })}
            {NEXT_STATES[post.state].includes("in_review") && unresolvedCount > 0 && (
              <span className="text-xs text-amber-600">
                Resolve {unresolvedCount} open comment{unresolvedCount === 1 ? "" : "s"} before submitting for review.
              </span>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <textarea
              ref={textareaRef}
              className="min-h-32 w-full resize-none overflow-hidden rounded-md border border-gray-300 p-3 font-mono text-sm"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Draft content (markdown subset: **bold**, *italic*, bullets)…"
              maxLength={MAX_CONTENT_LENGTH}
            />
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={handleSaveDraft}
                disabled={!dirty || saving}
                className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save as new version"}
              </button>
              <span className="text-xs text-gray-400">{versions.length} version(s)</span>
              <span
                className={`text-xs ${
                  draft.length > MAX_CONTENT_LENGTH * 0.95 ? "text-amber-600" : "text-gray-400"
                }`}
              >
                {draft.length.toLocaleString()} / {MAX_CONTENT_LENGTH.toLocaleString()}
              </span>
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
              LinkedIn preview {commentable && "— select text to comment on it"}
            </p>
            {dirty && (
              <p className="mb-2 text-xs text-amber-600">Save your draft to enable commenting on it.</p>
            )}
            <LinkedInPreview content={draft} commentable={commentable} />
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-lg bg-white p-4 shadow-sm">
        <div className="mb-4 flex gap-1 border-b border-gray-200">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-sm font-medium ${
                tab === t.id
                  ? "border-b-2 border-gray-900 text-gray-900"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

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
          <p className="text-sm text-gray-700">
            This permanently deletes the post, every version, all comments and reviews, and any
            attachments. This can&apos;t be undone.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleting}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40"
            >
              {deleting ? "Deleting…" : "Delete permanently"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
