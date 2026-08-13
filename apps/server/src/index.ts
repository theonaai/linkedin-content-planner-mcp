import Fastify from "fastify";
import multipart from "@fastify/multipart";
import cookie from "@fastify/cookie";
import { createDb } from "@linkedin-planner/db";
import { createCoreServices, MAX_ATTACHMENT_BYTES, MAX_HTTP_BODY_BYTES } from "@linkedin-planner/core";
import { loadEnv } from "./env.js";
import { ensureDefaultWorkspace } from "./workspace.js";
import { registerErrorHandler } from "./errorHandler.js";
import { createLocalFsStorage } from "./storage/localFsStorage.js";
import { createS3Storage } from "./storage/s3Storage.js";
import { registerPostRoutes } from "./routes/posts.js";
import { registerVersionRoutes } from "./routes/versions.js";
import { registerReviewRoutes } from "./routes/reviews.js";
import { registerCommentRoutes } from "./routes/comments.js";
import { registerAttachmentRoutes } from "./routes/attachments.js";
import { registerWebhookRoutes } from "./routes/webhooks.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerInviteRoutes } from "./routes/invites.js";
import { registerOAuthRoutes } from "./routes/oauth.js";
import { registerWellKnownRoutes } from "./routes/well-known.js";
import { registerMcpRoutes } from "./mcp/route.js";
import { initOAuthDb } from "./services/oauth/db.js";
import { registerStaticWeb } from "./staticWeb.js";

const env = loadEnv();
const db = createDb(env.databaseUrl);
const storage =
  env.storage.driver === "s3"
    ? createS3Storage(env.storage)
    : createLocalFsStorage(env.storage.attachmentsDir);
const core = createCoreServices(db, storage);
const workspaceId = await ensureDefaultWorkspace(db);
initOAuthDb(db);

const app = Fastify({ logger: true, bodyLimit: MAX_HTTP_BODY_BYTES });
await app.register(multipart, { limits: { fileSize: MAX_ATTACHMENT_BYTES } });
await app.register(cookie);
registerErrorHandler(app);

app.get("/health", async () => ({ status: "ok" }));

registerPostRoutes(app, core, env.auth, workspaceId);
registerVersionRoutes(app, core, env.auth);
registerReviewRoutes(app, core, env.auth);
registerCommentRoutes(app, core, env.auth);
registerAttachmentRoutes(app, core, env.auth, env.attachmentUploadSecret);
registerWebhookRoutes(app, core, env.auth, workspaceId);
registerMcpRoutes(app, core, env.auth, workspaceId, {
  secret: env.attachmentUploadSecret,
  publicBaseUrl: env.publicBaseUrl,
});

// Local dev has AUTH_ENABLED unset and keeps today's no-login behavior unchanged — only the
// cloud deployment sets it, at which point "Sign in with Theona" and the MCP OAuth AS both
// become available.
if (env.auth.enabled) {
  registerAuthRoutes(app, core, env.auth);
  registerInviteRoutes(app, core, env.auth);
  await registerOAuthRoutes(app, env.auth);
  registerWellKnownRoutes(app, env.auth);
}

// Must be last: registers a catch-all 404 handler that falls back to the SPA's index.html.
await registerStaticWeb(app);

await app.listen({ port: env.port, host: "0.0.0.0" });
