import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api.js";
import type { AccessKey } from "../lib/types.js";
import { CodeBlock } from "./CodeBlock.js";

const labelClass = "text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted";
const cardClass = "max-w-[900px] rounded-2xl border border-border bg-surface-1 p-7 shadow-card";
const inputClass =
  "w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-text-primary outline-none focus:border-accent focus:bg-surface-1 focus:ring-4 focus:ring-accent-soft";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Long-lived keys for MCP clients that cannot sign in through a browser, such as an Apify
 * Actor. The raw key is shown once after creation — the server keeps only its hash — so existing
 * keys are listed as metadata and can only be revoked. A `?label=` query parameter prefills the
 * form, so a listing elsewhere can link straight to it. */
export function AccessKeysCard() {
  const [searchParams] = useSearchParams();
  const [keys, setKeys] = useState<AccessKey[]>([]);
  const [label, setLabel] = useState(searchParams.get("label") ?? "");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setKeys(await api.listAccessKeys());
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    const trimmed = label.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.createAccessKey(trimmed);
      setCreatedKey(created.accessKey);
      setLabel("");
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function revoke(id: string) {
    setError(null);
    try {
      await api.revokeAccessKey(id);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div id="access-keys" className={cardClass}>
      <h2 className="text-lg font-semibold tracking-tight text-text-primary">Access keys</h2>
      <p className="mt-1.5 text-sm text-text-secondary">
        For platforms that can't sign in through a browser, such as Apify. A key opens the MCP endpoint for this
        workspace as you — send it as <code>Authorization: Bearer &lt;key&gt;</code>.
      </p>

      {createdKey ? (
        <div className="mt-5 flex flex-col gap-2">
          <p className="text-sm text-text-primary">Copy this key now — it won't be shown again.</p>
          <CodeBlock code={createdKey} />
          <button
            type="button"
            className="self-start text-xs font-medium text-accent-text hover:underline"
            onClick={() => setCreatedKey(null)}
          >
            Done
          </button>
        </div>
      ) : (
        <form
          className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor="access-key-label" className={labelClass}>
              Label
            </label>
            <input
              id="access-key-label"
              value={label}
              maxLength={100}
              placeholder="Apify"
              disabled={submitting}
              onChange={(e) => setLabel(e.target.value)}
              className={inputClass}
            />
          </div>
          <button
            type="submit"
            disabled={submitting || !label.trim()}
            className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-40"
          >
            Create access key
          </button>
        </form>
      )}

      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

      {keys.length > 0 && (
        <div className="mt-6 flex flex-col gap-2">
          <p className={labelClass}>Active keys</p>
          {keys.map((key) => (
            <div
              key={key.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 text-sm"
            >
              <span className="text-text-secondary">
                <span className="font-medium text-text-primary">{key.label}</span> ·{" "}
                {key.lastUsedAt ? `last used ${new Date(key.lastUsedAt).toLocaleDateString()}` : "never used"}
              </span>
              <button
                type="button"
                className="rounded-full px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-2"
                onClick={() => void revoke(key.id)}
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
