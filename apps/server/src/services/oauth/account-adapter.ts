/**
 * `findAccount` for `oidc-provider`. The login interaction (interactions.ts) only ever sets
 * `accountId` to a value it already verified via the planner's own session cookie — this just
 * confirms the user still exists (they may have been removed since the token was issued) and
 * projects it into the Account shape the library expects.
 */
import { eq } from "drizzle-orm";
import type { Account, FindAccount } from "oidc-provider";
import { users } from "@linkedin-planner/db";
import { getOAuthDb } from "./db.js";

export const findAccount: FindAccount = async (_ctx, sub) => {
  const db = getOAuthDb();
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.id, sub)).limit(1);
  if (!row) return undefined;

  const account: Account = {
    accountId: row.id,
    // Neither the userinfo nor id_token features are enabled (this AS only mints opaque-to-
    // clients JWT access tokens for /mcp) — claims() should never actually be invoked, but
    // the Account type requires an implementation regardless.
    claims: () => Promise.resolve({ sub: row.id }),
  };
  return account;
};
