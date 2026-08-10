export interface ConsentWorkspaceOption {
  id: string;
  name: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f9fafb; margin: 0; padding: 0; }
  .card { max-width: 420px; margin: 80px auto; background: #fff; border-radius: 8px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  h1 { font-size: 16px; margin: 0 0 8px; color: #111827; }
  p { font-size: 14px; color: #6b7280; line-height: 1.5; }
  ul { font-size: 14px; color: #374151; padding-left: 20px; }
  select { width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; margin-bottom: 16px; }
  .actions { display: flex; gap: 8px; margin-top: 16px; }
  button { flex: 1; padding: 10px; border-radius: 6px; font-size: 14px; font-weight: 500; cursor: pointer; border: none; }
  .allow { background: #111827; color: #fff; }
  .deny { background: #fff; color: #374151; border: 1px solid #d1d5db; }
  a.button { display: inline-block; text-align: center; text-decoration: none; }
</style>
</head>
<body>
<div class="card">${body}</div>
</body>
</html>`;
}

export function consentPage(params: {
  clientName: string;
  scopes: string[];
  allowUrl: string;
  denyUrl: string;
  csrfToken: string;
  accountEmail?: string;
  workspaces: ConsentWorkspaceOption[];
}): string {
  const workspaceField =
    params.workspaces.length > 1
      ? `<label for="workspace_id" style="font-size:13px;color:#374151;display:block;margin-bottom:4px;">Workspace</label>
         <select name="workspace_id" id="workspace_id">
           ${params.workspaces.map((w) => `<option value="${escapeHtml(w.id)}">${escapeHtml(w.name)}</option>`).join("")}
         </select>`
      : params.workspaces[0]
        ? `<input type="hidden" name="workspace_id" value="${escapeHtml(params.workspaces[0].id)}">`
        : "";

  return page(
    "Authorize access",
    `
    <h1>${escapeHtml(params.clientName)} wants to access your LinkedIn Content Planner</h1>
    ${params.accountEmail ? `<p>Signed in as ${escapeHtml(params.accountEmail)}</p>` : ""}
    <p>This will let it:</p>
    <ul>${params.scopes.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>
    <form method="POST" action="${params.allowUrl}">
      <input type="hidden" name="csrf" value="${escapeHtml(params.csrfToken)}">
      ${workspaceField}
      <div class="actions">
        <button type="submit" formaction="${params.denyUrl}" class="deny">Deny</button>
        <button type="submit" class="allow">Allow</button>
      </div>
    </form>
  `,
  );
}

export function errorPage(message: string): string {
  return page("Something went wrong", `<h1>Something went wrong</h1><p>${escapeHtml(message)}</p>`);
}

export function loginRequiredPage(params: { signInUrl: string }): string {
  return page(
    "Sign in required",
    `
    <h1>Sign in required</h1>
    <p>Sign in with your Theona account to continue.</p>
    <a class="button allow" href="${params.signInUrl}" style="padding:10px;border-radius:6px;">Sign in with Theona</a>
  `,
  );
}
