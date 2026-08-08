# LinkedIn Content Planner — v1 Plan

See [ARCHITECTURE.md](./ARCHITECTURE.md) for diagrams (system architecture, post state machine, data model).

## Goal
An MCP-first service for planning and preparing LinkedIn content (Substack etc. later). AI agents do the writing/moving of posts through a pipeline; humans review, comment, approve, and schedule via a web UI. No AI runs *inside* the platform itself — it's a tool agents call into (via MCP) and a UI humans use to review.

## Core flow
1. User tells an agent an idea → agent creates a post in **backlog** via MCP.
2. On a schedule the user controls externally (their own agent loop/cron — not built into this service), an agent pulls posts from backlog, researches, drafts, formats, and assigns a future date and moves state → **todo** → **in progress**.
3. When the agent thinks a draft is done, it submits it for review → **in_review**.
4. Human reviews in the web UI: mock LinkedIn preview, leaves inline comments, compares versions, then either **approves** (→ **ready**) or **requests changes** (→ back to **in_progress**, with a required note on what to fix — the agent picks it back up).
5. On the scheduled date, human manually publishes on LinkedIn and marks the post **posted** (optionally pastes the live URL). Auto-publish via LinkedIn's API is a documented future extension point, not built now.
6. A scheduled agent job can call `list_posts(state=ready, scheduled_before=today)` to find what's due so it can remind the human or, once auto-publish exists, act on it directly.

## Entities (multi-tenant-ready, no auth enforced yet)
- **workspace** — tenant boundary. v1 local mode auto-seeds one default workspace; no login screen.
- **membership** (user_id, workspace_id, role) — schema exists now so "give my ghost-writer access to this workspace" is a real future feature, but nothing enforces it in v1 (single implicit user locally).
- **post** — platform (`linkedin`, future `substack`), state (`backlog|todo|in_progress|in_review|ready|posted`), scheduled_date (nullable), workspace_id, timestamps.
- **post_version** — immutable snapshot per edit: markdown-subset content, author, created_at. Latest version = current content. Diffs computed on read (text diff), not stored. A "revert" creates a *new* version copying an old one's content (history stays linear and append-only — nothing is ever deleted or rewritten).
- **comment** — anchored to a post_version + optional text range (offset/length), thread (parent_comment_id), resolved flag. GitHub-review-style, for line/selection-level feedback.
- **review** — a decision on a post_version: `approved` or `changes_requested`, by whom, optional body (required for `changes_requested`). Distinct from `comment` (which is inline/threaded) — this is the coarse-grained "PR review" gate that drives the `in_review → ready` / `in_review → in_progress` transition.
- **attachment** — file (image/PDF carousel) linked to a post, stored via a storage interface (local filesystem in v1, swappable for S3-compatible later).
- **state_event** — audit log of state/date changes (who/what changed it, when) — powers "view history" and keeps agents accountable.

## Formatting approach
Canonical content is a constrained **markdown subset** (bold/italic/line breaks/simple bullets) — not literal Unicode. This keeps content diffable, searchable, and easy for agents to read/write. A shared `formatting` module converts markdown → LinkedIn's Unicode-style bold/italic only at two points: the mock-preview render and a "copy for posting" export. Same module is used by web UI and MCP server so preview always matches what an agent sees.

## Architecture
TypeScript full-stack, pnpm workspace monorepo:

```
apps/
  server/   Fastify (or Hono) REST API + MCP server on the same process,
            MCP exposed via Streamable HTTP (the current MCP transport spec,
            successor to the deprecated SSE-only transport) at /mcp —
            one transport implementation used both locally (http://localhost:PORT/mcp)
            and remotely once deployed, both backed by the same core service layer
  web/      React + Vite, Tailwind + shadcn/ui
packages/
  core/     domain types, service layer (post/version/comment/attachment logic),
            shared by REST handlers and MCP tools
  formatting/  markdown-subset <-> LinkedIn Unicode conversion, diff helper
  db/       Drizzle ORM schema + migrations (Postgres)
infra/
  docker-compose.yml   Postgres for local dev (same DB engine locally and in cloud)
```

- **Storage**: local filesystem for attachments in v1 behind a `StorageAdapter` interface (swap to S3-compatible/Railway bucket later without touching callers).
- **DB**: Postgres from day one (via docker-compose locally), so local → cloud is a config change, not a migration.
- **Auth**: no implementation in v1. `workspace_id`/`user_id` columns exist; server runs with a single seeded system user locally. Real auth (session/OAuth) is a later phase, added at the API boundary without schema changes.

## MCP tool surface (v1)
`create_post`, `list_posts` (filter by state(s), scheduled_date range, platform, sorted by date — e.g. an agent asks for `state=ready, scheduled_before=today` to find posts due to publish; no separate "due posts" tool needed), `get_post`, `update_post_content` (creates new version), `list_versions`, `get_version_diff`, `revert_to_version` (creates a new version from an old one's content), `set_post_state` (server enforces the legal-transition graph regardless of caller — covers `in_progress → in_review` too, no separate "submit for review" tool needed), `set_post_date`, `submit_review` (decision `approve`|`request_changes` [+ body] — writes a review record *and* drives `in_review → ready` or `in_review → in_progress`; this is the one place state changes as a side effect of something richer, so it stays separate from `set_post_state`), `list_reviews`, `add_comment`, `list_comments`, `resolve_comment`, `attach_file`, `list_attachments`, `render_preview` (markdown → LinkedIn-formatted text). Research and drafting itself is the calling agent's own job (web search etc.) — not a platform tool.

## Web UI (v1)
- **Backlog list** — flat list/board of `backlog` + `todo` posts.
- **Calendar view** — month view, posts plotted on `scheduled_date`, color-coded by state.
- **Post detail** — mock LinkedIn preview (rendered via `formatting`), state + date controls, attachments panel. When state is `in_review`: **Approve** / **Request changes** actions (request changes requires a note).
- **Comments** — inline, anchored to text selection, threaded, resolve/unresolve.
- **Versions** — list of versions, side-by-side/inline diff compare (GitHub-style), plus a **Revert to this version** action (creates a new version copying the old content — history stays append-only).
- **Reviews** — review history on a post (who approved/requested changes and when), shown alongside versions like a GitHub PR's review log.

## Explicitly out of scope for v1
- Any AI/LLM calls inside the platform itself.
- Auth implementation (schema only).
- LinkedIn API auto-publish (manual publish + status flag only).
- Substack/other platforms (schema supports `platform` field, no second integration built).
- Cloud deployment (build local-first; Railway deploy is a later phase using the skill already available in this environment).

## Phased build order
1. Monorepo scaffold + Drizzle schema/migrations + docker-compose Postgres.
2. Core service layer + REST API (CRUD posts/versions/states/reviews/comments/attachments; state-transition graph enforced server-side).
3. MCP server wrapping the core layer, exposed via Streamable HTTP on the same process as the REST API (same transport locally and in the cloud), including `submit_review` and a filterable `list_posts` (covers due-posts queries). `set_post_state` handles all plain transitions, including entering review.
4. Web UI: backlog list + calendar + post detail with state/date editing.
5. Formatting module + mock LinkedIn preview.
6. Versions UI + diff compare + revert + inline comments + review actions (approve/request changes).
7. Attachments upload/download.
8. (Later, separate effort) Auth, cloud deploy, LinkedIn auto-publish, Substack support.
