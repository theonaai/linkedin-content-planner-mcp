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

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const memberships = pgTable("memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull(),
  role: varchar("role", { length: 32 }).notNull().default("owner"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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
