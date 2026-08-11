import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../auth/AuthProvider.js";
import type { Invite, WorkspaceMember, WorkspaceRole } from "../lib/types.js";

const ROLE_LABELS: Record<WorkspaceRole, string> = { owner: "Owner", member: "Member" };

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
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="mb-3 text-sm font-semibold text-gray-900">Invite someone</p>
      <p className="mb-3 text-xs text-gray-500">
        They'll get access the next time they sign in with Theona using this email — no separate
        invite link needed.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-gray-500" htmlFor="invite-email">
            Email
          </label>
          <input
            id="invite-email"
            type="email"
            placeholder="ghostwriter@example.com"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500" htmlFor="invite-role">
            Role
          </label>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value as WorkspaceRole)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="member">Member</option>
            <option value="owner">Owner</option>
          </select>
        </div>
        <button
          onClick={handleSubmit}
          disabled={submitting || !email.trim()}
          className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Send invite
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
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
    return <p className="text-sm text-gray-500">Team management requires signing in.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Team</h1>
        <p className="mt-1 text-sm text-gray-500">Who has access to this workspace.</p>
      </div>

      <InviteForm workspaceId={activeWorkspaceId} onInvited={load} />

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Members</p>
        {loading ? (
          <p className="text-xs text-gray-400">Loading…</p>
        ) : (
          <div className="flex flex-col gap-2">
            {members.map((m) => (
              <div
                key={m.userId}
                className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3"
              >
                <span className="text-sm text-gray-900">{m.email}</span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  {ROLE_LABELS[m.role]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {invites.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Pending invites</p>
          <div className="flex flex-col gap-2">
            {invites.map((invite) => (
              <div
                key={invite.id}
                className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3"
              >
                <div>
                  <span className="text-sm text-gray-900">{invite.email}</span>
                  <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-xs text-gray-600">
                    {ROLE_LABELS[invite.role]}
                  </span>
                </div>
                <button
                  onClick={() => handleRevoke(invite.id)}
                  className="text-xs text-red-600 hover:underline"
                >
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
