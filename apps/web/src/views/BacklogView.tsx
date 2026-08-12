import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js";
import { usePostsWithSnippets, type PostWithSnippet } from "../lib/usePostsWithSnippets.js";
import { NEXT_STATES, POST_STATES, STATE_CARD_CLASSES, STATE_COLORS, STATE_LABELS } from "../lib/stateMachine.js";
import type { PostState } from "../lib/types.js";

// Active-pipeline states get the kanban board; backlog and posted can accumulate a lot of
// posts over time (an unprocessed idea pile, a full publish history), so they get compact
// scrollable lists below instead of columns that would grow unboundedly tall.
const KANBAN_STATES: PostState[] = ["todo", "in_progress", "in_review", "ready"];

const moveButtonClass =
  "rounded-full border border-border bg-surface-1 px-2.5 py-1 text-[11px] font-medium text-text-secondary hover:border-accent hover:text-accent-text";

const ALL_FILTER = "all";
type StateFilter = PostState | typeof ALL_FILTER;

export function BacklogView() {
  const { posts, loading, error, reload } = usePostsWithSnippets();
  const [newIdea, setNewIdea] = useState("");
  const [creating, setCreating] = useState(false);
  // Reviewing from a phone is the main mobile use case, so the flat filtered list (mobile
  // only — see below) opens straight on "in_review" rather than "all".
  const [mobileFilter, setMobileFilter] = useState<StateFilter>("in_review");

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
  const filteredPosts = (mobileFilter === ALL_FILTER ? posts : posts.filter((p) => p.state === mobileFilter)).slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <div className="flex flex-col gap-7">
      <form onSubmit={handleCreate} className="flex items-center gap-3">
        <input
          className="flex-1 rounded-xl border border-border bg-surface-1 px-4.5 py-3.5 text-[15px] text-text-primary outline-none focus:border-accent focus:ring-4 focus:ring-accent-soft"
          placeholder="New post idea… (adds to backlog)"
          value={newIdea}
          onChange={(e) => setNewIdea(e.target.value)}
        />
        <button
          type="submit"
          disabled={creating || !newIdea.trim()}
          className="rounded-full bg-accent px-7 py-3.5 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-40"
        >
          Add idea
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : (
        <>
          {/* Phones: one flat list filtered by state (defaults to "In review", the main mobile
              use case), instead of the multi-column kanban board which doesn't fit narrow
              screens. Tablet/desktop keep the full board below, unchanged. */}
          <div className="flex flex-col gap-3 md:hidden">
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
              <FilterPill label="All" active={mobileFilter === ALL_FILTER} onClick={() => setMobileFilter(ALL_FILTER)} />
              {POST_STATES.map((state) => (
                <FilterPill
                  key={state}
                  label={STATE_LABELS[state]}
                  active={mobileFilter === state}
                  onClick={() => setMobileFilter(state)}
                />
              ))}
            </div>
            {filteredPosts.length === 0 ? (
              <p className="text-sm text-text-muted">Nothing here.</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {filteredPosts.map((post) => (
                  <Link
                    key={post.id}
                    to={`/posts/${post.id}`}
                    className={`flex flex-col gap-2 rounded-xl border border-l-[3px] p-4 ${STATE_CARD_CLASSES[post.state]}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className={`text-[11px] font-semibold uppercase tracking-[0.1em] ${STATE_COLORS[post.state].label}`}>
                        {STATE_LABELS[post.state]}
                      </span>
                      {post.scheduledDate && (
                        <span className="text-[11px] tabular-nums text-text-muted">{post.scheduledDate}</span>
                      )}
                    </div>
                    <span className="text-sm leading-snug text-text-primary">
                      {post.snippet || <span className="italic text-text-muted">(empty)</span>}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="hidden flex-col gap-7 md:flex">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
              {columns.map(({ state, posts: statePosts }) => (
                <div key={state} className="flex min-h-[190px] flex-col gap-3 rounded-2xl border border-border bg-surface-1 p-4">
                  <div className="flex items-center justify-between">
                    <span className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${STATE_COLORS[state].label}`}>
                      {STATE_LABELS[state]}
                    </span>
                    <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-semibold text-text-muted">
                      {statePosts.length}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {statePosts.map((post) => (
                      <div
                        key={post.id}
                        className={`flex flex-col gap-2.5 rounded-lg border border-l-[3px] p-3 ${STATE_CARD_CLASSES[state]}`}
                      >
                        <Link to={`/posts/${post.id}`} className="flex flex-col gap-1">
                          <span className="text-[13px] font-medium leading-snug text-text-primary">
                            {post.snippet || <span className="italic text-text-muted">(empty)</span>}
                          </span>
                          {post.scheduledDate && (
                            <span className="text-[11px] tabular-nums text-text-muted">{post.scheduledDate}</span>
                          )}
                        </Link>
                        {NEXT_STATES[state].length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {NEXT_STATES[state].map((next) => (
                              <button key={next} onClick={() => advance(post.id, next)} className={moveButtonClass}>
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

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <PostListSection title="Backlog" posts={backlogPosts} onAdvance={advance} />
              <PostListSection title="Posted" posts={postedPosts} onAdvance={advance} posted />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-medium whitespace-nowrap ${
        active ? "border-[rgba(229,81,43,0.25)] bg-accent-soft text-accent-text" : "border-border bg-surface-1 text-text-secondary"
      }`}
    >
      {label}
    </button>
  );
}

function PostListSection({
  title,
  posts,
  onAdvance,
  posted = false,
}: {
  title: string;
  posts: PostWithSnippet[];
  onAdvance: (postId: string, toState: PostState) => void;
  posted?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3.5 rounded-2xl border border-border bg-surface-1 p-5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">{title}</span>
        <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-semibold text-text-muted">
          {posts.length}
        </span>
      </div>
      {posts.length === 0 ? (
        <p className="text-xs text-text-muted">Nothing here.</p>
      ) : (
        <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
          {posts.map((post) => (
            <div
              key={post.id}
              className={
                posted
                  ? `flex items-center justify-between gap-4 rounded-lg border border-l-[3px] px-3.5 py-3 ${STATE_CARD_CLASSES.posted}`
                  : "flex items-center justify-between gap-4 rounded-lg border border-border bg-surface-2 px-3.5 py-3 hover:border-border-strong hover:bg-surface-1"
              }
            >
              <Link to={`/posts/${post.id}`} className="min-w-0 flex-1 truncate text-[13px] text-text-primary">
                {post.snippet || <span className="italic text-text-muted">(empty)</span>}
              </Link>
              <div className="flex shrink-0 items-center gap-2.5">
                {post.scheduledDate && (
                  <span className="whitespace-nowrap text-[11px] tabular-nums text-text-muted">{post.scheduledDate}</span>
                )}
                {NEXT_STATES[post.state].map((next) => (
                  <button key={next} onClick={() => onAdvance(post.id, next)} className={moveButtonClass}>
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
