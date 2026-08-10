import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { createDb } from "@linkedin-planner/db";
import { createCoreServices } from "@linkedin-planner/core";
import { loadEnv } from "./env.js";
import { ensureDefaultWorkspace } from "./workspace.js";
import { registerErrorHandler } from "./errorHandler.js";
import { createLocalFsStorage } from "./storage/localFsStorage.js";
import { registerPostRoutes } from "./routes/posts.js";
import { registerVersionRoutes } from "./routes/versions.js";
import { registerReviewRoutes } from "./routes/reviews.js";
import { registerCommentRoutes } from "./routes/comments.js";
import { registerAttachmentRoutes } from "./routes/attachments.js";
import { registerWebhookRoutes } from "./routes/webhooks.js";
import { registerMcpRoutes } from "./mcp/route.js";

const env = loadEnv();
const db = createDb(env.databaseUrl);
const storage = createLocalFsStorage(env.attachmentsDir);
const core = createCoreServices(db, storage);
const workspaceId = await ensureDefaultWorkspace(db);

const app = Fastify({ logger: true });
await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024 } });
registerErrorHandler(app);

app.get("/health", async () => ({ status: "ok" }));

registerPostRoutes(app, core, workspaceId);
registerVersionRoutes(app, core);
registerReviewRoutes(app, core);
registerCommentRoutes(app, core);
registerAttachmentRoutes(app, core);
registerWebhookRoutes(app, core, workspaceId);
registerMcpRoutes(app, core, workspaceId);

await app.listen({ port: env.port, host: "0.0.0.0" });
