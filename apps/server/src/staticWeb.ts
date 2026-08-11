import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";

// apps/server/dist/staticWeb.js -> apps/web/dist
const WEB_DIST_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");

/**
 * Serves the built web app from the same origin as the API — required so the planner's
 * session cookie (SameSite=Lax) actually reaches /api requests. Two separate origins (e.g. a
 * static host + this API) would silently break login. A no-op locally, where the web app runs
 * on its own Vite dev server instead (see apps/web/vite.config.ts's /api proxy).
 */
export async function registerStaticWeb(app: FastifyInstance): Promise<void> {
  if (!existsSync(WEB_DIST_DIR)) return;

  await app.register(fastifyStatic, { root: WEB_DIST_DIR });

  const nonSpaPrefixes = ["/api/", "/mcp", "/oauth/", "/.well-known/", "/mcp-oauth/"];

  app.setNotFoundHandler(async (request, reply) => {
    if (request.method !== "GET" || nonSpaPrefixes.some((prefix) => request.url.startsWith(prefix))) {
      return reply.code(404).send({ error: "Not found" });
    }
    return reply.sendFile("index.html");
  });
}
