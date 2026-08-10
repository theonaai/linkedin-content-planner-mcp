import { createHmac } from "node:crypto";
import { eq, and, asc, desc } from "drizzle-orm";
import { webhooks, webhookDeliveries, type Db } from "@linkedin-planner/db";
import { NotFoundError } from "../errors.js";
import type { WebhookEvent } from "../types.js";

const DELIVERY_TIMEOUT_MS = 5000;
const DELIVERY_ATTEMPTS = 2;

function sign(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

async function post(url: string, body: string, headers: Record<string, string>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
  try {
    return await fetch(url, { method: "POST", body, headers, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export function createWebhookService(db: Db) {
  async function getWebhook(webhookId: string) {
    const [row] = await db.select().from(webhooks).where(eq(webhooks.id, webhookId)).limit(1);
    if (!row) throw new NotFoundError("Webhook", webhookId);
    return row;
  }

  return {
    getWebhook,

    async createWebhook(params: {
      workspaceId: string;
      url: string;
      events: WebhookEvent[];
      secret?: string;
    }) {
      const [row] = await db
        .insert(webhooks)
        .values({
          workspaceId: params.workspaceId,
          url: params.url,
          events: params.events,
          secret: params.secret ?? null,
        })
        .returning();
      return row;
    },

    async listWebhooks(workspaceId: string) {
      return db
        .select()
        .from(webhooks)
        .where(eq(webhooks.workspaceId, workspaceId))
        .orderBy(asc(webhooks.createdAt));
    },

    async updateWebhook(params: {
      webhookId: string;
      url?: string;
      events?: WebhookEvent[];
      secret?: string | null;
      active?: boolean;
    }) {
      await getWebhook(params.webhookId);
      const { webhookId, ...patch } = params;
      const [row] = await db.update(webhooks).set(patch).where(eq(webhooks.id, webhookId)).returning();
      return row;
    },

    async deleteWebhook(webhookId: string) {
      await getWebhook(webhookId);
      await db.delete(webhooks).where(eq(webhooks.id, webhookId));
    },

    async listDeliveries(webhookId: string) {
      await getWebhook(webhookId);
      return db
        .select()
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.webhookId, webhookId))
        .orderBy(desc(webhookDeliveries.createdAt));
    },

    /** Fire-and-forget: finds active webhooks in the workspace subscribed to this event and
     * delivers to each, with one retry and a full delivery log entry per attempt-sequence
     * (GitHub/Stripe-style). Never throws — a slow or broken receiver must not block the
     * action (post created, review submitted, ...) that triggered the event. */
    async dispatch(workspaceId: string, event: WebhookEvent, payload: Record<string, unknown>) {
      try {
        const active = await db
          .select()
          .from(webhooks)
          .where(and(eq(webhooks.workspaceId, workspaceId), eq(webhooks.active, true)));
        const targets = active.filter((w) => w.events.includes(event));
        if (targets.length === 0) return;

        const body = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });

        await Promise.all(
          targets.map(async (webhook) => {
            const headers: Record<string, string> = { "content-type": "application/json" };
            if (webhook.secret) headers["x-webhook-signature"] = `sha256=${sign(webhook.secret, body)}`;

            let success = false;
            let responseStatus: number | undefined;
            let error: string | undefined;

            for (let attempt = 0; attempt < DELIVERY_ATTEMPTS && !success; attempt++) {
              try {
                const res = await post(webhook.url, body, headers);
                responseStatus = res.status;
                success = res.ok;
                if (!success) error = `HTTP ${res.status}`;
              } catch (err) {
                error = err instanceof Error ? err.message : String(err);
              }
            }

            await db.insert(webhookDeliveries).values({
              webhookId: webhook.id,
              event,
              payload,
              success,
              responseStatus: responseStatus ?? null,
              error: error ?? null,
            });
          }),
        );
      } catch {
        // Delivery/logging failures must never propagate into the caller's request flow.
      }
    },
  };
}

export type WebhookService = ReturnType<typeof createWebhookService>;
