import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { WEBHOOK_EVENTS, type Webhook, type WebhookDelivery, type WebhookEvent } from "../lib/types.js";

const EVENT_LABELS: Record<WebhookEvent, string> = {
  "post.created": "Post created",
  "post.state_changed": "Post state changed",
  "post.review_changes_requested": "Review: changes requested",
  "post.review_approved": "Review: approved",
  "post.comment_added": "Comment added",
  "post.deleted": "Post deleted",
};

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
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="mb-3 text-sm font-semibold text-gray-900">Add webhook</p>
      <div className="flex flex-col gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500" htmlFor="webhook-url">
            URL
          </label>
          <input
            id="webhook-url"
            type="url"
            placeholder="https://example.com/hooks/linkedin-planner"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500" htmlFor="webhook-secret">
            Signing secret (optional)
          </label>
          <input
            id="webhook-secret"
            type="text"
            placeholder="Used to sign deliveries with X-Webhook-Signature"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-gray-500">Trigger on</p>
          <div className="grid grid-cols-2 gap-1.5">
            {WEBHOOK_EVENTS.map((event) => (
              <label key={event} className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={events.includes(event)} onChange={() => toggleEvent(event)} />
                {EVENT_LABELS[event]}
              </label>
            ))}
          </div>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div>
          <button
            onClick={handleSubmit}
            disabled={submitting || !url.trim() || events.length === 0}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
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

  if (loading) return <p className="text-xs text-gray-400">Loading deliveries…</p>;
  if (deliveries.length === 0) return <p className="text-xs text-gray-400">No deliveries yet.</p>;

  return (
    <div className="flex flex-col gap-1.5">
      {deliveries.map((d) => (
        <div
          key={d.id}
          className={`rounded-md border p-2 text-xs ${
            d.success ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-medium">{EVENT_LABELS[d.event]}</span>
            <span className="text-gray-400">{new Date(d.createdAt).toLocaleString()}</span>
          </div>
          <p className="mt-0.5 text-gray-600">
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
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-gray-900">{webhook.url}</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {webhook.events.map((event) => (
              <span key={event} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                {EVENT_LABELS[event]}
              </span>
            ))}
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
            webhook.active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
          }`}
        >
          {webhook.active ? "Active" : "Paused"}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-3 text-xs">
        <button onClick={toggleActive} disabled={busy} className="text-gray-600 hover:underline disabled:opacity-40">
          {webhook.active ? "Pause" : "Resume"}
        </button>
        <button
          onClick={() => setShowDeliveries((v) => !v)}
          className="text-gray-600 hover:underline"
        >
          {showDeliveries ? "Hide deliveries" : "View deliveries"}
        </button>
        <button onClick={handleDelete} disabled={busy} className="text-red-600 hover:underline disabled:opacity-40">
          Delete
        </button>
      </div>
      {showDeliveries && (
        <div className="mt-3 border-t border-gray-100 pt-3">
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
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Webhooks</h1>
        <p className="mt-1 text-sm text-gray-500">
          Notify agents or other systems by POSTing a JSON payload whenever chosen events happen.
        </p>
      </div>
      <NewWebhookForm onCreated={load} />
      <div className="flex flex-col gap-3">
        {loading ? (
          <p className="text-xs text-gray-400">Loading…</p>
        ) : webhooks.length === 0 ? (
          <p className="text-xs text-gray-400">No webhooks registered yet.</p>
        ) : (
          webhooks.map((w) => <WebhookRow key={w.id} webhook={w} onChanged={load} />)
        )}
      </div>
    </div>
  );
}
