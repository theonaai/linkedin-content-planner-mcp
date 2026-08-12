import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../auth/AuthProvider.js";
import type { Invite, WorkspaceMember, WorkspaceRole } from "../lib/types.js";

const ROLE_LABELS: Record<WorkspaceRole, string> = { owner: "Owner", member: "Member" };
const labelClass = "text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted";
const inputClass =
  "w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-text-primary outline-none focus:border-accent focus:bg-surface-1 focus:ring-4 focus:ring-accent-soft";

/** A styled <select> matching the app's text-input look — a plain <select> renders with the
 * OS's native chrome (different padding/arrow) unless appearance is reset and a custom
 * indicator is drawn back in. */
function RoleSelect({
  id,
  value,
  onChange,
  disabled,
  compact = false,
}: {
  id?: string;
  value: WorkspaceRole;
  onChange: (role: WorkspaceRole) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as WorkspaceRole)}
        className={`w-full cursor-pointer appearance-none rounded-xl border border-border bg-surface-2 pl-3.5 text-text-primary outline-none focus:border-accent focus:bg-surface-1 focus:ring-4 focus:ring-accent-soft disabled:cursor-not-allowed disabled:opacity-50 ${
          compact ? "py-1.5 pr-8 text-xs" : "py-3 pr-9 text-sm"
        }`}
      >
        <option value="member">Member</option>
        <option value="owner">Owner</option>
      </select>
      <span
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-text-muted ${
          compact ? "right-2.5 text-[9px]" : "right-3.5 text-[10px]"
        }`}
      >
        ▾
      </span>
    </div>
  );
}

function CreateTeamForm({ onCreated }: { onCreated: (workspaceId: string) => void }) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const workspace = await api.createWorkspace(name.trim());
      setName("");
      onCreated(workspace.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-[900px] rounded-2xl border border-border bg-surface-1 p-7 shadow-card">
      <h2 className="text-lg font-semibold tracking-tight text-text-primary">Create a new team</h2>
      <p className="mt-1.5 text-sm text-text-secondary">
        Starts a separate workspace with its own posts and members — you're its owner. Switch between teams from the
        picker in the header.
      </p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className={`mb-2 block ${labelClass}`} htmlFor="new-team-name">
            Team name
          </label>
          <input
            id="new-team-name"
            placeholder="Marketing team"
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <button
          onClick={handleSubmit}
          disabled={submitting || !name.trim()}
          className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-40"
        >
          Create team
        </button>
      </div>
      {error && <p className="mt-2.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}

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
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="w-[150px]">
          <label className={`mb-2 block ${labelClass}`} htmlFor="invite-role">
            Role
          </label>
          <RoleSelect id="invite-role" value={role} onChange={setRole} />
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
  const { status, activeWorkspaceId, refreshMemberships } = useAuth();
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  async function handleRoleChange(userId: string, role: WorkspaceRole) {
    if (!activeWorkspaceId) return;
    setError(null);
    try {
      await api.updateMemberRole(activeWorkspaceId, userId, role);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleRemove(userId: string, email: string) {
    if (!activeWorkspaceId) return;
    if (!confirm(`Remove ${email} from this workspace?`)) return;
    setError(null);
    try {
      await api.removeMember(activeWorkspaceId, userId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleTeamCreated(workspaceId: string) {
    await refreshMemberships(workspaceId);
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

      {error && <p className="max-w-[900px] text-sm text-red-600">{error}</p>}

      <CreateTeamForm onCreated={handleTeamCreated} />

      <InviteForm workspaceId={activeWorkspaceId} onInvited={load} />

      <div className="max-w-[900px]">
        <p className={`mb-3 ${labelClass}`}>Members</p>
        {loading ? (
          <p className="text-xs text-text-muted">Loading…</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-surface-1">
            {members.map((m) => {
              const isSelf = status.userId === m.userId;
              return (
                <div
                  key={m.userId}
                  className="flex items-center justify-between gap-4 border-b border-border px-5 py-3.5 last:border-b-0"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full border border-border bg-surface-3" />
                    <span className="text-sm text-text-primary">
                      {m.email}
                      {isSelf && <span className="ml-1.5 text-xs text-text-muted">(you)</span>}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="w-[110px]">
                      <RoleSelect
                        compact
                        value={m.role}
                        disabled={isSelf}
                        onChange={(role) => handleRoleChange(m.userId, role)}
                      />
                    </div>
                    <button
                      onClick={() => handleRemove(m.userId, m.email)}
                      disabled={isSelf}
                      title={isSelf ? "You can't remove yourself" : undefined}
                      className="text-xs font-medium text-accent-text hover:underline disabled:cursor-not-allowed disabled:text-text-muted disabled:no-underline"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
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
