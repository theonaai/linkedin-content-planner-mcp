import Fastify from "fastify";
import { createDb } from "@linkedin-planner/db";
import { createCoreServices } from "@linkedin-planner/core";
import { loadEnv } from "./env.js";
import { ensureDefaultWorkspace } from "./workspace.js";
import { registerErrorHandler } from "./errorHandler.js";
import { registerPostRoutes } from "./routes/posts.js";
import { registerVersionRoutes } from "./routes/versions.js";
import { registerReviewRoutes } from "./routes/reviews.js";
import { registerCommentRoutes } from "./routes/comments.js";
import { registerMcpRoutes } from "./mcp/route.js";

const env = loadEnv();
const db = createDb(env.databaseUrl);
const core = createCoreServices(db);
const workspaceId = await ensureDefaultWorkspace(db);

const app = Fastify({ logger: true });
registerErrorHandler(app);

app.get("/health", async () => ({ status: "ok" }));

registerPostRoutes(app, core, workspaceId);
registerVersionRoutes(app, core);
registerReviewRoutes(app, core);
registerCommentRoutes(app, core);
registerMcpRoutes(app, core, workspaceId);

await app.listen({ port: env.port, host: "0.0.0.0" });
