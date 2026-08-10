/**
 * Postgres adapter for `oidc-provider`, one `mcp_oauth_<model>` table per model — see
 * packages/db/src/schema.ts's oauthModelColumns() for the shared row shape and rationale.
 * TTL enforcement happens here in hydrateIfLive(); replay detection lives in the payload
 * itself (the library inspects `consumed_at`/`consumed` directly, we just store it).
 */
import { eq } from "drizzle-orm";
import type { Adapter, AdapterPayload } from "oidc-provider";
import {
  mcpOauthSession,
  mcpOauthAccessToken,
  mcpOauthAuthorizationCode,
  mcpOauthRefreshToken,
  mcpOauthClient,
  mcpOauthGrant,
  mcpOauthInteraction,
} from "@linkedin-planner/db";
import { getOAuthDb } from "./db.js";

/** oidc-provider model name → table. Only models for the features enabled in provider.ts are
 * listed; an unknown model throws loudly at construction so enabling a new feature without
 * adding its table fails immediately instead of silently losing data. */
const TABLE_BY_MODEL = {
  Session: mcpOauthSession,
  AccessToken: mcpOauthAccessToken,
  AuthorizationCode: mcpOauthAuthorizationCode,
  RefreshToken: mcpOauthRefreshToken,
  Client: mcpOauthClient,
  Grant: mcpOauthGrant,
  Interaction: mcpOauthInteraction,
} as const;

type ModelName = keyof typeof TABLE_BY_MODEL;
type OAuthTable = (typeof TABLE_BY_MODEL)[ModelName];

interface OAuthRow {
  id: string;
  payload: unknown;
  grantId: string | null;
  uid: string | null;
  expiresAt: Date | null;
  consumedAt: Date | null;
}

const GRANT_CHILD_TABLES = [mcpOauthAccessToken, mcpOauthAuthorizationCode, mcpOauthRefreshToken, mcpOauthSession];

export class PostgresOAuthAdapter implements Adapter {
  private readonly table: OAuthTable;

  constructor(public readonly name: string) {
    const table = TABLE_BY_MODEL[name as ModelName];
    if (!table) {
      throw new Error(`PostgresOAuthAdapter: no table mapping for oidc-provider model "${name}"`);
    }
    this.table = table;
  }

  async upsert(id: string, payload: AdapterPayload, expiresIn: number): Promise<void> {
    const db = getOAuthDb();
    // Client rows have no TTL (expiresIn undefined) — guard against NaN.
    const expiresAt =
      typeof expiresIn === "number" && Number.isFinite(expiresIn) ? new Date(Date.now() + expiresIn * 1000) : null;
    const row = { id, payload, grantId: payload.grantId ?? null, uid: payload.uid ?? null, expiresAt };
    await db
      .insert(this.table)
      .values(row)
      .onConflictDoUpdate({ target: this.table.id, set: row });
  }

  async find(id: string): Promise<AdapterPayload | undefined> {
    const db = getOAuthDb();
    const [row] = await db.select().from(this.table).where(eq(this.table.id, id)).limit(1);
    return hydrateIfLive(row as OAuthRow | undefined);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async findByUserCode(): Promise<AdapterPayload | undefined> {
    // DeviceCode model only — features.deviceFlow is never enabled (see provider.ts).
    throw new Error(
      "PostgresOAuthAdapter.findByUserCode is not implemented: the OAuth device flow is disabled.",
    );
  }

  async findByUid(uid: string): Promise<AdapterPayload | undefined> {
    const db = getOAuthDb();
    const [row] = await db.select().from(this.table).where(eq(this.table.uid, uid)).limit(1);
    return hydrateIfLive(row as OAuthRow | undefined);
  }

  async consume(id: string): Promise<void> {
    const db = getOAuthDb();
    await db.update(this.table).set({ consumedAt: new Date() }).where(eq(this.table.id, id));
  }

  async destroy(id: string): Promise<void> {
    const db = getOAuthDb();
    await db.delete(this.table).where(eq(this.table.id, id));
  }

  async revokeByGrantId(grantId: string): Promise<void> {
    const db = getOAuthDb();
    for (const table of GRANT_CHILD_TABLES) {
      await db.delete(table).where(eq(table.grantId, grantId));
    }
    // The Grant table uses `id` as its own primary key (not grant_id), so it can't go in the
    // fan-out above — leaving it alive would let a future token exchange referencing this
    // grantId succeed even though its children were just swept.
    await db.delete(mcpOauthGrant).where(eq(mcpOauthGrant.id, grantId));
  }
}

/** Hydrate a row to an AdapterPayload, dropping anything already expired — this is the real
 * TTL enforcement point: find/findByUid must behave as if expired rows had been swept.
 * `expiresAt = null` means never expires (Client rows). Consumed rows are NOT filtered —
 * replay detection lives in the payload and the library needs to see them. */
export function hydrateIfLive(row: OAuthRow | undefined): AdapterPayload | undefined {
  if (!row) return undefined;
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return undefined;
  return row.payload as AdapterPayload;
}
