import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js";
import { usePostsWithSnippets, type PostWithSnippet } from "../lib/usePostsWithSnippets.js";
import { NEXT_STATES, STATE_LABELS } from "../lib/stateMachine.js";
import { StateBadge } from "../components/StateBadge.js";
import type { PostState } from "../lib/types.js";

// Active-pipeline states get the kanban board; backlog and posted can accumulate a lot of
// posts over time (an unprocessed idea pile, a full publish history), so they get compact
// scrollable lists below instead of columns that would grow unboundedly tall.
const KANBAN_STATES: PostState[] = ["todo", "in_progress", "in_review", "ready"];

export function BacklogView() {
  const { posts, loading, error, reload } = usePostsWithSnippets();
  const [newIdea, setNewIdea] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newIdea.trim()) return;
    setCreating(true);
    try {
      await api.createPost({ initialContent: newIdea.trim() });
      setNewIdea("");
      await reload();
    } finally {
      setCreating(false);
    }
  }

  async function advance(postId: string, toState: PostState) {
    await api.setPostState(postId, toState);
    await reload();
  }

  const columns = KANBAN_STATES.map((state) => ({
    state,
    posts: posts.filter((p) => p.state === state),
  }));
  const backlogPosts = posts
    .filter((p) => p.state === "backlog")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const postedPosts = posts
    .filter((p) => p.state === "posted")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <div>
      <form onSubmit={handleCreate} className="mb-6 flex gap-2">
        <input
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
          placeholder="New post idea… (adds to backlog)"
          value={newIdea}
          onChange={(e) => setNewIdea(e.target.value)}
        />
        <button
          type="submit"
          disabled={creating || !newIdea.trim()}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Add
        </button>
      </form>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {columns.map(({ state, posts: statePosts }) => (
              <div key={state} className="rounded-lg bg-white p-3 shadow-sm">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {STATE_LABELS[state]} <span className="text-gray-400">({statePosts.length})</span>
                </h2>
                <div className="flex flex-col gap-2">
                  {statePosts.map((post) => (
                    <div key={post.id} className="rounded-md border border-gray-200 p-2">
                      <Link to={`/posts/${post.id}`} className="block text-sm text-gray-900 hover:underline">
                        {post.snippet || <span className="italic text-gray-400">(empty)</span>}
                      </Link>
                      <div className="mt-1 flex items-center justify-between">
                        <StateBadge state={post.state} />
                        {post.scheduledDate && (
                          <span className="text-xs text-gray-500">{post.scheduledDate}</span>
                        )}
                      </div>
                      {NEXT_STATES[state].length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {NEXT_STATES[state].map((next) => (
                            <button
                              key={next}
                              onClick={() => advance(post.id, next)}
                              className="rounded border border-gray-300 px-1.5 py-0.5 text-[11px] text-gray-600 hover:bg-gray-100"
                            >
                              → {STATE_LABELS[next]}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <PostListSection title="Backlog" posts={backlogPosts} onAdvance={advance} />
            <PostListSection title="Posted" posts={postedPosts} onAdvance={advance} />
          </div>
        </>
      )}
    </div>
  );
}

function PostListSection({
  title,
  posts,
  onAdvance,
}: {
  title: string;
  posts: PostWithSnippet[];
  onAdvance: (postId: string, toState: PostState) => void;
}) {
  return (
    <div className="rounded-lg bg-white p-3 shadow-sm">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        {title} <span className="text-gray-400">({posts.length})</span>
      </h2>
      {posts.length === 0 ? (
        <p className="text-xs text-gray-400">Nothing here.</p>
      ) : (
        <div className="flex max-h-80 flex-col divide-y divide-gray-100 overflow-y-auto">
          {posts.map((post) => (
            <div key={post.id} className="flex items-center justify-between gap-3 py-2">
              <Link
                to={`/posts/${post.id}`}
                className="min-w-0 flex-1 truncate text-sm text-gray-900 hover:underline"
              >
                {post.snippet || <span className="italic text-gray-400">(empty)</span>}
              </Link>
              <div className="flex shrink-0 items-center gap-2">
                {post.scheduledDate && <span className="text-xs text-gray-400">{post.scheduledDate}</span>}
                {NEXT_STATES[post.state].map((next) => (
                  <button
                    key={next}
                    onClick={() => onAdvance(post.id, next)}
                    className="rounded border border-gray-300 px-1.5 py-0.5 text-[11px] text-gray-600 hover:bg-gray-100"
                  >
                    → {STATE_LABELS[next]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
