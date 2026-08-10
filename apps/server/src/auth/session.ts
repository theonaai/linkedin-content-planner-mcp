import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE_NAME = "planner_session";
/** Matches aidl-002's own AS session TTL (14 days) — no particular coupling required, just a
 * reasonable, familiar default for "how long does staying signed in last." */
export const SESSION_TTL_SECONDS = 14 * 24 * 60 * 60;

export interface SessionPayload {
  userId: string;
}

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/** The planner's own session, issued after a successful Theona login — completely independent
 * of aidl-002's token lifetime; nothing beyond that one login exchange ever touches aidl-002
 * again for the lifetime of this session. */
export async function createSessionToken(secret: string, payload: SessionPayload): Promise<string> {
  return new SignJWT({ userId: payload.userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey(secret));
}

export async function verifySessionToken(secret: string, token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(secret), { algorithms: ["HS256"] });
    if (typeof payload.userId !== "string" || !payload.userId) return null;
    return { userId: payload.userId };
  } catch {
    return null;
  }
}
