import type { Db } from "@linkedin-planner/db";

// oidc-provider's callback-based API (findAccount, the Adapter class, extraTokenClaims) gives
// us no way to thread request-scoped dependencies through — every other module in this
// subsystem needs the same `Db` handle, so it's set once at boot rather than passed around.
let db: Db | null = null;

export function initOAuthDb(instance: Db): void {
  db = instance;
}

export function getOAuthDb(): Db {
  if (!db) throw new Error("OAuth db not initialized — call initOAuthDb() before the AS handles any request");
  return db;
}
