import type { FastifyRequest } from "fastify";
import type { CoreServices } from "@linkedin-planner/core";
import type { AuthEnv } from "../env.js";
import { verifySessionToken, SESSION_COOKIE_NAME } from "./session.js";
import { UnauthorizedError } from "./errors.js";

const WORKSPACE_HEADER = "x-workspace-id";

/** Resolves the signed-in user from the session cookie. Callers only reach this when
 * AUTH_ENABLED=true — the un-authed local-dev path never calls into this module at all. */
export async function requireUserId(request: FastifyRequest, auth: AuthEnv): Promise<string> {
  const token = request.cookies[SESSION_COOKIE_NAME];
  const session = token ? await verifySessionToken(auth.sessionCookieSecret, token) : null;
  if (!session) throw new UnauthorizedError();
  return session.userId;
}

/** For "top-level" routes that create/list within a workspace rather than operate on an
 * existing resource (create post, list posts, create webhook, list webhooks): picks the
 * workspace from the `x-workspace-id` header if present (validated against membership — a
 * caller can't just claim a workspace they don't belong to), otherwise falls back to the
 * user's first membership. Most users only have their personal workspace today, so this
 * keeps single-workspace usage header-free while still supporting explicit selection once a
 * user belongs to more than one. */
export async function resolveCallerWorkspace(
  request: FastifyRequest,
  core: CoreServices,
  auth: AuthEnv,
): Promise<{ userId: string; workspaceId: string }> {
  const userId = await requireUserId(request, auth);
  const headerValue = request.headers[WORKSPACE_HEADER];
  const requestedWorkspaceId = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  if (requestedWorkspaceId) {
    await core.users.assertMembership(userId, requestedWorkspaceId);
    return { userId, workspaceId: requestedWorkspaceId };
  }

  const memberships = await core.users.listMemberships(userId);
  if (memberships.length === 0) {
    // Shouldn't happen — login always provisions a personal workspace — but fail closed
    // rather than silently falling through to "no workspace restriction."
    throw new UnauthorizedError("No workspace membership");
  }
  return { userId, workspaceId: memberships[0].workspaceId };
}

/** For routes that operate on an existing resource by id: verifies the caller belongs to the
 * workspace that resource actually lives in. `resolveWorkspaceId` is one of core.authz's
 * resolve*Workspace functions, applied to the resource's id from the route params. */
export async function requireResourceAccess(
  request: FastifyRequest,
  core: CoreServices,
  auth: AuthEnv,
  resolveWorkspaceId: () => Promise<string>,
): Promise<string> {
  const userId = await requireUserId(request, auth);
  const workspaceId = await resolveWorkspaceId();
  await core.users.assertMembership(userId, workspaceId);
  return workspaceId;
}
