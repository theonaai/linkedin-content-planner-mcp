# LinkedIn Content Planner (MCP)

A LinkedIn content pipeline built for AI agents, not humans typing into a text box. Your agent
(Claude Code, Claude Desktop, or any [MCP](https://modelcontextprotocol.io)-compatible client, on
whatever schedule you run it — cron, an agent loop, a chat session) drafts, formats, and moves
posts through a review pipeline by calling MCP tools directly: `create_post`,
`update_post_content`, `submit_review`, and more. A human just reviews, comments, and
approves/requests changes from the web UI before anything goes live — the same shape as reviewing
a PR before merge, not manually operating a scheduling tool.

Multi-tenant and OAuth-secured out of the box: agents authenticate against the planner's own
OAuth 2.1 authorization server (PKCE, dynamic client registration) and every MCP call is scoped to
the caller's workspace.

See [PLAN.md](./PLAN.md) and [ARCHITECTURE.md](./ARCHITECTURE.md) for the full design.

## Local development

Requirements: Node 20+, pnpm, a Postgres 16 instance (via `infra/docker-compose.yml` or a local install).

```bash
# 1. Start Postgres
docker compose -f infra/docker-compose.yml up -d
# (or point DATABASE_URL at any local Postgres 16 instance)

# 2. Install dependencies
pnpm install

# 3. Configure env
cp apps/server/.env.example apps/server/.env
# edit DATABASE_URL if not using the default docker-compose credentials

# 4. Generate + run migrations, seed default workspace
pnpm --filter @linkedin-planner/db generate
DATABASE_URL=postgres://linkedin_planner:linkedin_planner@localhost:5432/linkedin_planner_dev pnpm --filter @linkedin-planner/db migrate
DATABASE_URL=postgres://linkedin_planner:linkedin_planner@localhost:5432/linkedin_planner_dev pnpm --filter @linkedin-planner/db seed

# 5. Run the server
pnpm dev:server
```

## MCP tool surface

Posts: `create_post`, `list_posts`, `get_post`, `update_post_content`, `str_replace_post_content`,
`set_post_state`, `set_post_date`, `delete_post`. Versions: `list_versions`, `get_version_diff`,
`revert_to_version`. Review: `submit_review`, `list_reviews`. Comments: `add_comment`,
`list_comments`, `resolve_comment`. Attachments: `prepare_attachment_upload`, `attach_file`,
`list_attachments`, `delete_attachment`. Preview:
`render_preview`. Webhooks (subscribe to post lifecycle events): `create_webhook`,
`list_webhooks`, `update_webhook`, `delete_webhook`, `list_webhook_deliveries`. Full tool schemas
are served at the `/mcp` endpoint itself; see [PLAN.md](./PLAN.md) for the design rationale behind
each.

### Uploading an attachment

`attach_file` takes base64 inline, which is only practical for small files: a 160 KB image is
~217,000 base64 characters, more context than most agents can spend and more than any of them can
retype without a silent corruption. Anything larger goes through a ticket instead:

```
prepare_attachment_upload(postId, filename, mimeType)
  -> { uploadUrl, method: "PUT", expiresAt, maxBytes }

curl -T ./carousel.pdf '<uploadUrl>'     # bytes never enter the conversation
list_attachments(postId)                 # confirm it landed
```

`delete_attachment(attachmentId)` removes a file and its record for good. It is worth using
every time a re-rendered carousel or image supersedes an earlier one: nothing expires on its
own, and stale files keep counting against the per-workspace limit.

The URL embeds an HMAC-signed ticket scoped to that one post, valid 15 minutes, and rejected
afterwards. Both paths converge on the same `attachFile` service, so the 25 MB per-file and 250 MB
per-workspace caps apply identically. Set `ATTACHMENT_UPLOAD_SECRET` when running more than one
instance — unset, each process signs with its own random key and a ticket minted by one instance
will not verify on another.

## Monorepo layout

- `apps/server` — REST API + MCP server (Streamable HTTP at `/mcp`), same process, same core logic.
- `apps/web` — React UI: backlog, calendar, post review.
- `packages/core` — domain types and service layer shared by REST and MCP.
- `packages/formatting` — markdown-subset ⇄ LinkedIn Unicode formatting.
- `packages/db` — Drizzle ORM schema and migrations.

## License

[PolyForm Noncommercial License 1.0.0](./LICENSE.md). Source-available, not OSI open source: free
to use, modify, and self-host for any noncommercial purpose; any commercial or paid use requires a
separate license from Theona, Inc.
