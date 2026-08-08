import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api.js";
import { NEXT_STATES, STATE_LABELS } from "../lib/stateMachine.js";
import { StateBadge } from "../components/StateBadge.js";
import { LinkedInPreview } from "../components/LinkedInPreview.js";
import type { Post, PostVersion } from "../lib/types.js";

export function PostDetailView() {
  const { id } = useParams<{ id: string }>();
  const [post, setPost] = useState<Post | null>(null);
  const [versions, setVersions] = useState<PostVersion[]>([]);
  const [draft, setDraft] = useState("");
  const [dateInput, setDateInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [loadedPost, loadedVersions] = await Promise.all([api.getPost(id), api.listVersions(id)]);
      setPost(loadedPost);
      setVersions(loadedVersions);
      setDraft(loadedVersions[loadedVersions.length - 1]?.contentMarkdown ?? "");
      setDateInput(loadedPost.scheduledDate ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

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

  async function commitDate() {
    if (!post) return;
    const next = dateInput || null;
    if (next === (post.scheduledDate ?? null)) return;
    try {
      await api.setPostDate(post.id, next);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (loading) return <p className="text-sm text-gray-500">Loading…</p>;
  if (!post) return <p className="text-sm text-red-600">{error ?? "Post not found"}</p>;

  const latestVersion = versions[versions.length - 1];
  const dirty = draft !== (latestVersion?.contentMarkdown ?? "");

  return (
    <div>
      <Link to="/" className="mb-4 inline-block text-sm text-gray-500 hover:underline">
        ← Back to backlog
      </Link>

      <div className="rounded-lg bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <StateBadge state={post.state} />
            <span className="text-xs text-gray-400">{post.platform}</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500" htmlFor="scheduledDate">
              Scheduled date
            </label>
            <input
              id="scheduledDate"
              type="date"
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
              value={dateInput}
              onChange={(e) => setDateInput(e.target.value)}
              onBlur={commitDate}
            />
          </div>
        </div>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        {post.state === "in_review" ? (
          <p className="mb-3 rounded-md bg-purple-50 px-3 py-2 text-sm text-purple-800">
            Awaiting review. Approve / request-changes actions land in Phase 6 — for now, use the
            <code className="mx-1 rounded bg-purple-100 px-1">submit_review</code>
            MCP tool or the REST API.
          </p>
        ) : (
          NEXT_STATES[post.state].length > 0 && (
            <div className="mb-4 flex gap-2">
              {NEXT_STATES[post.state].map((next) => (
                <button
                  key={next}
                  onClick={() => handleTransition(next)}
                  className="rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-100"
                >
                  Move to {STATE_LABELS[next]}
                </button>
              ))}
            </div>
          )
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <textarea
              className="h-64 w-full resize-y rounded-md border border-gray-300 p-3 font-mono text-sm"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Draft content (markdown subset: **bold**, *italic*, bullets)…"
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
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
              LinkedIn preview
            </p>
            <LinkedInPreview content={draft} />
          </div>
        </div>
      </div>
    </div>
  );
}
