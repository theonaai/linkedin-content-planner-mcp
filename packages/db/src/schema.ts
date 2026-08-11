import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  boolean,
  integer,
  date,
  timestamp,
  jsonb,
  unique,
} from "drizzle-orm/pg-core";

export const platformEnum = pgEnum("platform", ["linkedin", "substack"]);

export const postStateEnum = pgEnum("post_state", [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "ready",
  "posted",
]);

export const reviewDecisionEnum = pgEnum("review_decision", [
  "approved",
  "changes_requested",
]);

export const webhookEventEnum = pgEnum("webhook_event", [
  "post.created",
  "post.state_changed",
  "post.review_changes_requested",
  "post.review_approved",
  "post.comment_added",
  "post.deleted",
]);

// Identity is federated from Theona's own OAuth AS (see docs on the auth plan) — this table
// is a thin mirror keyed by that token's `sub`, never a credential store. No passwords, no
// duplicated auth state; it exists purely so workspace membership has something to point at.
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  theonaUserId: text("theona_user_id").notNull().unique(),
  email: text("email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 32 }).notNull().default("owner"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.workspaceId, table.userId)],
);

// A pending "give my ghost-writer access" invite — the invitee may not have ever logged into
// the planner yet, so there's no users row to point at until they do. Resolved by email at
// login time (see core.invites.consumePendingInvites): once someone logs in with a matching
// email, the invite becomes a real membership and this row is deleted.
export const invites = pgTable(
  "invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: varchar("role", { length: 32 }).notNull().default("member"),
    invitedByUserId: uuid("invited_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.workspaceId, table.email)],
);

export const posts = pgTable("posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  platform: platformEnum("platform").notNull().default("linkedin"),
  state: postStateEnum("state").notNull().default("backlog"),
  scheduledDate: date("scheduled_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const postVersions = pgTable("post_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  postId: uuid("post_id")
    .notNull()
    .references(() => posts.id, { onDelete: "cascade" }),
  contentMarkdown: text("content_markdown").notNull().default(""),
  authorId: uuid("author_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const comments = pgTable("comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  postVersionId: uuid("post_version_id")
    .notNull()
    .references(() => postVersions.id, { onDelete: "cascade" }),
  parentCommentId: uuid("parent_comment_id"),
  anchorOffset: integer("anchor_offset"),
  anchorLength: integer("anchor_length"),
  body: text("body").notNull(),
  resolved: boolean("resolved").notNull().default(false),
  authorId: uuid("author_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reviews = pgTable("reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  postVersionId: uuid("post_version_id")
    .notNull()
    .references(() => postVersions.id, { onDelete: "cascade" }),
  reviewerId: uuid("reviewer_id"),
  decision: reviewDecisionEnum("decision").notNull(),
  body: text("body"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const attachments = pgTable("attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  postId: uuid("post_id")
    .notNull()
    .references(() => posts.id, { onDelete: "cascade" }),
  storageKey: text("storage_key").notNull(),
  filename: text("filename").notNull(),
  mimeType: varchar("mime_type", { length: 128 }).notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stateEvents = pgTable("state_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  postId: uuid("post_id")
    .notNull()
    .references(() => posts.id, { onDelete: "cascade" }),
  fromState: postStateEnum("from_state"),
  toState: postStateEnum("to_state").notNull(),
  actorId: uuid("actor_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const webhooks = pgTable("webhooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  events: webhookEventEnum("events").array().notNull(),
  secret: text("secret"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: uuid("id").primaryKey().defaultRandom(),
  webhookId: uuid("webhook_id")
    .notNull()
    .references(() => webhooks.id, { onDelete: "cascade" }),
  event: webhookEventEnum("event").notNull(),
  payload: jsonb("payload").notNull(),
  success: boolean("success").notNull(),
  responseStatus: integer("response_status"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// --- The planner's own OAuth 2.1 authorization server (mints tokens for AI agents calling
// /mcp) — one table per `oidc-provider` model, mirroring aidl-002's own mcp_oauth_* schema.
// Every row shares the same shape: `id` (the library's own opaque id, not a UUID we mint),
// `payload` (the model's full JSON state — the library's source of truth), `grantId`/`uid`
// (indexed lookup keys some models use), `expiresAt`/`consumedAt` (TTL + replay tracking).
// See packages/db/../services/oauth/adapter.ts for how these are read/written.
function oauthModelColumns() {
  return {
    id: text("id").primaryKey(),
    payload: jsonb("payload").notNull(),
    grantId: text("grant_id"),
    uid: text("uid"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
  };
}

export const mcpOauthSession = pgTable("mcp_oauth_session", oauthModelColumns());
export const mcpOauthAccessToken = pgTable("mcp_oauth_access_token", oauthModelColumns());
export const mcpOauthAuthorizationCode = pgTable("mcp_oauth_authorization_code", oauthModelColumns());
export const mcpOauthRefreshToken = pgTable("mcp_oauth_refresh_token", oauthModelColumns());
export const mcpOauthClient = pgTable("mcp_oauth_client", oauthModelColumns());
export const mcpOauthInteraction = pgTable("mcp_oauth_interaction", oauthModelColumns());

// Grant carries one extra column beyond the generic shape: the workspace an MCP connection
// was bound to at consent time (the user picks it on the consent screen when they belong to
// more than one workspace). Every access token minted off this grant gets it stamped in as
// the `workspace_id` claim — see services/oauth/grant-workspace.ts.
export const mcpOauthGrant = pgTable("mcp_oauth_grant", {
  ...oauthModelColumns(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
});
