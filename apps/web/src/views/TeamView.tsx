import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../auth/AuthProvider.js";
import type { Invite, WorkspaceMember, WorkspaceRole } from "../lib/types.js";

const ROLE_LABELS: Record<WorkspaceRole, string> = { owner: "Owner", member: "Member" };
const labelClass = "text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted";

function InviteForm({ workspaceId, onInvited }: { workspaceId: string; onInvited: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("member");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!email.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.createInvite(workspaceId, email.trim(), role);
      setEmail("");
      setRole("member");
      onInvited();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-[900px] rounded-2xl border border-border bg-surface-1 p-7 shadow-card">
      <h2 className="text-lg font-semibold tracking-tight text-text-primary">Invite someone</h2>
      <p className="mt-1.5 text-sm text-text-secondary">
        They'll get access the next time they sign in with Theona using this email — no separate invite link needed.
      </p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className={`mb-2 block ${labelClass}`} htmlFor="invite-email">
            Email
          </label>
          <input
            id="invite-email"
            type="email"
            placeholder="ghostwriter@example.com"
            className="w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-text-primary outline-none focus:border-accent focus:bg-surface-1 focus:ring-4 focus:ring-accent-soft"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className={`mb-2 block ${labelClass}`} htmlFor="invite-role">
            Role
          </label>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value as WorkspaceRole)}
            className="w-[150px] rounded-xl border border-border bg-surface-2 px-3.5 py-3 text-sm text-text-primary outline-none focus:border-accent"
          >
            <option value="member">Member</option>
            <option value="owner">Owner</option>
          </select>
        </div>
        <button
          onClick={handleSubmit}
          disabled={submitting || !email.trim()}
          className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-40"
        >
          Send invite
        </button>
      </div>
      {error && <p className="mt-2.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function TeamView() {
  const { status, activeWorkspaceId } = useAuth();
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    const [membersRes, invitesRes] = await Promise.all([
      api.listMembers(activeWorkspaceId),
      api.listInvites(activeWorkspaceId),
    ]);
    setMembers(membersRes);
    setInvites(invitesRes);
    setLoading(false);
  }, [activeWorkspaceId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRevoke(inviteId: string) {
    if (!activeWorkspaceId) return;
    await api.revokeInvite(activeWorkspaceId, inviteId);
    load();
  }

  if (status.kind !== "authenticated" || !activeWorkspaceId) {
    return <p className="text-sm text-text-muted">Team management requires signing in.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex max-w-[640px] flex-col gap-2">
        <p className={labelClass}>People</p>
        <h1 className="text-[34px] font-light leading-[1.1] tracking-tight text-text-primary">Team</h1>
        <p className="text-[15px] text-text-secondary">Who has access to this workspace.</p>
      </div>

      <InviteForm workspaceId={activeWorkspaceId} onInvited={load} />

      <div className="max-w-[900px]">
        <p className={`mb-3 ${labelClass}`}>Members</p>
        {loading ? (
          <p className="text-xs text-text-muted">Loading…</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-surface-1">
            {members.map((m) => (
              <div key={m.userId} className="flex items-center justify-between gap-4 border-b border-border px-5 py-3.5 last:border-b-0">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full border border-border bg-surface-3" />
                  <span className="text-sm text-text-primary">{m.email}</span>
                </div>
                <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-text-secondary">
                  {ROLE_LABELS[m.role]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {invites.length > 0 && (
        <div className="max-w-[900px]">
          <p className={`mb-3 ${labelClass}`}>Pending invites</p>
          <div className="flex flex-col gap-2.5">
            {invites.map((invite) => (
              <div
                key={invite.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-l-[3px] border-[rgba(196,138,20,0.28)] border-l-[rgb(196,138,20)] bg-[rgba(196,138,20,0.07)] px-5 py-3.5"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm text-text-primary">{invite.email}</span>
                  <span className="rounded-full bg-surface-1 px-2.5 py-1 text-xs text-text-secondary">
                    {ROLE_LABELS[invite.role]}
                  </span>
                  <span className="text-xs text-text-muted">Invited {formatInvitedAgo(invite.createdAt)}</span>
                </div>
                <button onClick={() => handleRevoke(invite.id)} className="text-xs font-medium text-accent-text hover:underline">
                  Revoke
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatInvitedAgo(createdAt: string): string {
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}
