# LinkedIn Content Planner

MCP-first service for planning and preparing LinkedIn content. See [PLAN.md](./PLAN.md) and [ARCHITECTURE.md](./ARCHITECTURE.md) for the design.

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

## Monorepo layout

- `apps/server` — REST API + MCP server (Streamable HTTP at `/mcp`), same process, same core logic.
- `apps/web` — React UI: backlog, calendar, post review.
- `packages/core` — domain types and service layer shared by REST and MCP.
- `packages/formatting` — markdown-subset ⇄ LinkedIn Unicode formatting.
- `packages/db` — Drizzle ORM schema and migrations.
