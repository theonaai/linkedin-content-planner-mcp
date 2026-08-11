import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { MAX_WEBHOOK_URL_LENGTH, MAX_WEBHOOK_SECRET_LENGTH } from "../lib/limits.js";
import { WEBHOOK_EVENTS, type Webhook, type WebhookDelivery, type WebhookEvent } from "../lib/types.js";

const EVENT_LABELS: Record<WebhookEvent, string> = {
  "post.created": "Post created",
  "post.state_changed": "Post state changed",
  "post.review_changes_requested": "Review: changes requested",
  "post.review_approved": "Review: approved",
  "post.comment_added": "Comment added",
  "post.deleted": "Post deleted",
};

const inputClass =
  "w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-text-primary outline-none focus:border-accent focus:bg-surface-1 focus:ring-4 focus:ring-accent-soft";
const labelClass = "text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted";

function NewWebhookForm({ onCreated }: { onCreated: () => void }) {
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleEvent(event: WebhookEvent) {
    setEvents((prev) => (prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]));
  }

  async function handleSubmit() {
    if (!url.trim() || events.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.createWebhook({ url: url.trim(), events, secret: secret.trim() || undefined });
      setUrl("");
      setSecret("");
      setEvents([]);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-[900px] rounded-2xl border border-border bg-surface-1 p-7 shadow-card">
      <h2 className="mb-5 text-lg font-semibold tracking-tight text-text-primary">Add webhook</h2>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label className={labelClass} htmlFor="webhook-url">
            URL
          </label>
          <input
            id="webhook-url"
            type="url"
            placeholder="https://example.com/hooks/linkedin-planner"
            className={inputClass}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            maxLength={MAX_WEBHOOK_URL_LENGTH}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className={labelClass} htmlFor="webhook-secret">
            Signing secret <span className="normal-case tracking-normal text-text-muted">(optional)</span>
          </label>
          <input
            id="webhook-secret"
            type="text"
            placeholder="Used to sign deliveries with X-Webhook-Signature"
            className={inputClass}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            maxLength={MAX_WEBHOOK_SECRET_LENGTH}
          />
        </div>
        <div className="flex flex-col gap-3">
          <p className={labelClass}>Trigger on</p>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {WEBHOOK_EVENTS.map((event) => {
              const on = events.includes(event);
              return (
                <label
                  key={event}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3.5 py-3 text-sm ${
                    on ? "border-[rgba(229,81,43,0.3)] bg-accent-soft text-text-primary" : "border-border bg-surface-2 text-text-primary"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleEvent(event)}
                    className="h-4 w-4 accent-accent"
                  />
                  {EVENT_LABELS[event]}
                </label>
              );
            })}
          </div>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div>
          <button
            onClick={handleSubmit}
            disabled={submitting || !url.trim() || events.length === 0}
            className="rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-40"
          >
            Add webhook
          </button>
        </div>
      </div>
    </div>
  );
}

function DeliveryLog({ webhookId }: { webhookId: string }) {
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listWebhookDeliveries(webhookId)
      .then(setDeliveries)
      .finally(() => setLoading(false));
  }, [webhookId]);

  if (loading) return <p className="text-xs text-text-muted">Loading deliveries…</p>;
  if (deliveries.length === 0) return <p className="text-xs text-text-muted">No deliveries yet.</p>;

  return (
    <div className="flex flex-col gap-2">
      {deliveries.map((d) => (
        <div
          key={d.id}
          className={`rounded-lg border p-3 text-xs ${
            d.success ? "border-border bg-surface-2" : "border-red-200 bg-red-50"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-medium text-text-primary">{EVENT_LABELS[d.event]}</span>
            <span className="text-text-muted">{new Date(d.createdAt).toLocaleString()}</span>
          </div>
          <p className="mt-0.5 text-text-secondary">
            {d.success ? `Delivered (HTTP ${d.responseStatus})` : `Failed${d.error ? `: ${d.error}` : ""}`}
          </p>
        </div>
      ))}
    </div>
  );
}

function WebhookRow({ webhook, onChanged }: { webhook: Webhook; onChanged: () => void }) {
  const [showDeliveries, setShowDeliveries] = useState(false);
  const [busy, setBusy] = useState(false);

  async function toggleActive() {
    setBusy(true);
    try {
      await api.updateWebhook(webhook.id, { active: !webhook.active });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete webhook for ${webhook.url}? This can't be undone.`)) return;
    setBusy(true);
    try {
      await api.deleteWebhook(webhook.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-border px-5 py-4 last:border-b-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-text-primary">{webhook.url}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {webhook.events.map((event) => (
              <span key={event} className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-text-secondary">
                {EVENT_LABELS[event]}
              </span>
            ))}
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${
            webhook.active ? "bg-accent-soft text-accent-text" : "bg-surface-3 text-text-muted"
          }`}
        >
          {webhook.active ? "Active" : "Paused"}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-4 text-xs">
        <button onClick={toggleActive} disabled={busy} className="text-text-secondary hover:underline disabled:opacity-40">
          {webhook.active ? "Pause" : "Resume"}
        </button>
        <button onClick={() => setShowDeliveries((v) => !v)} className="text-text-secondary hover:underline">
          {showDeliveries ? "Hide deliveries" : "View deliveries"}
        </button>
        <button onClick={handleDelete} disabled={busy} className="text-accent-text hover:underline disabled:opacity-40">
          Remove
        </button>
      </div>
      {showDeliveries && (
        <div className="mt-3 border-t border-border pt-3">
          <DeliveryLog webhookId={webhook.id} />
        </div>
      )}
    </div>
  );
}

export function WebhooksView() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setWebhooks(await api.listWebhooks());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex max-w-[640px] flex-col gap-2">
        <p className={labelClass}>Integrations</p>
        <h1 className="text-[34px] font-light leading-[1.1] tracking-tight text-text-primary">Webhooks</h1>
        <p className="text-[15px] text-text-secondary">
          Notify agents or other systems by POSTing a JSON payload whenever chosen events happen.
        </p>
      </div>
      <NewWebhookForm onCreated={load} />
      <div className="flex max-w-[900px] flex-col gap-3">
        <p className={labelClass}>Registered</p>
        {loading ? (
          <p className="text-xs text-text-muted">Loading…</p>
        ) : webhooks.length === 0 ? (
          <p className="text-xs text-text-muted">No webhooks registered yet.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-surface-1">
            {webhooks.map((w) => (
              <WebhookRow key={w.id} webhook={w} onChanged={load} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
