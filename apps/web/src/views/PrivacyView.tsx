import type { ReactNode } from "react";

const EFFECTIVE = "2 September 2026";
const CONTACT = "privacy@theona.ai";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold tracking-tight text-text-primary">{title}</h2>
      <div className="flex flex-col gap-3 text-[15px] leading-relaxed text-text-secondary">{children}</div>
    </section>
  );
}

/**
 * Deliberately outside `AuthGate` (see App.tsx): a privacy policy that only a logged-in user can
 * read is not published. Both the ChatGPT App Directory and the Claude Connectors Directory
 * require a reachable policy URL before they will list a server, and their reviewers have no
 * account here.
 */
export function PrivacyView() {
  return (
    <div className="min-h-screen bg-bg px-6 py-14">
      <div className="mx-auto flex max-w-[760px] flex-col gap-9">
        <header className="flex flex-col gap-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">
            LinkedIn Content Planner
          </p>
          <h1 className="text-[34px] font-light leading-[1.1] tracking-tight text-text-primary">Privacy Policy</h1>
          <p className="text-sm text-text-muted">Effective {EFFECTIVE} · Theona, Inc.</p>
        </header>

        <Section title="Scope">
          <p>
            This policy covers the LinkedIn Content Planner at this domain and its MCP endpoint. The Planner is a
            separate product from the Theona platform, and Theona&rsquo;s own privacy policy does not extend to it.
            The controller is Theona, Inc., a remote-first company registered in Delaware, USA.
          </p>
        </Section>

        <Section title="What the Planner is, and what it is not">
          <p>
            The Planner is a pipeline for drafting, revising and reviewing posts. It does not post to LinkedIn or
            anywhere else &mdash; a person takes the approved text and publishes it themselves.
          </p>
          <p>
            No AI model runs inside the Planner. The models are on the other side of it: the Planner is a tool that AI
            agents call into, and the drafting is done by whichever agent you authorise. Your content is read and
            written by that agent, and therefore by the model behind it.
          </p>
        </Section>

        <Section title="Information we collect">
          <p>
            <strong className="font-medium text-text-primary">Identity.</strong> Your Theona user identifier and email
            address. Sign-in is federated from Theona&rsquo;s authorization server, so the Planner stores no password
            and no credential of any kind.
          </p>
          <p>
            <strong className="font-medium text-text-primary">Invitations.</strong> When you invite someone, their
            email address and a record of who invited them, until they sign in and the invitation becomes a
            membership.
          </p>
          <p>
            <strong className="font-medium text-text-primary">Your content.</strong> Posts and every saved revision,
            comments, review decisions and their text, and attachments you upload &mdash; filename, type, size and the
            file itself. Content is free-form, so whatever you put in it, we hold.
          </p>
          <p>
            <strong className="font-medium text-text-primary">Activity.</strong> State changes on a post, with who made
            them and when.
          </p>
          <p>
            <strong className="font-medium text-text-primary">Integrations you configure.</strong> If you set up a
            webhook, the destination URL, its signing secret, and a record of each delivery including the payload sent
            &mdash; which contains post content.
          </p>
          <p>
            <strong className="font-medium text-text-primary">Agent connections.</strong> OAuth sessions, grants and
            tokens for the agents you authorise, and the workspace each grant is bound to.
          </p>
          <p>
            <strong className="font-medium text-text-primary">Technical data.</strong> Requests to the service are
            logged with the originating IP address, the browser or client identifier, the path requested and the
            response. These logs exist to keep the service running and to investigate faults and abuse.
          </p>
        </Section>

        <Section title="Cookies and local storage">
          <p>
            The Planner sets no advertising cookies, no analytics cookies and no third-party cookies. It runs no
            analytics or tracking of any kind, so there is nothing here to consent to or opt out of. Three items are
            stored, all of them necessary for the product to work at all:
          </p>
          <p>
            <strong className="font-medium text-text-primary">planner_session</strong> &mdash; the cookie that keeps
            you signed in. HTTP-only, sent only over HTTPS, expires after 14 days, and is cleared when you sign out.
          </p>
          <p>
            <strong className="font-medium text-text-primary">theona_oauth_flow</strong> &mdash; a short-lived cookie
            that holds a single sign-in attempt together while you are redirected to Theona and back. It expires after
            five minutes.
          </p>
          <p>
            <strong className="font-medium text-text-primary">planner_active_workspace_id</strong> &mdash; stored in
            your browser, not sent to us as a cookie. It remembers which workspace you last worked in, and only
            appears if you belong to more than one.
          </p>
        </Section>

        <Section title="How we use it">
          <p>
            To operate the product: store and version your drafts, show them to the people you invited, deliver the
            events you configured, and let the agents you authorised read and write on your instruction. Nothing else.
            Your content is not used to train models, ours or anyone else&rsquo;s.
          </p>
        </Section>

        <Section title="Legal bases (GDPR)">
          <p>
            Performance of a contract, for operating the service. Legitimate interests, for security and abuse
            prevention. Consent, where you supply someone else&rsquo;s email address in an invitation.
          </p>
        </Section>

        <Section title="Sharing">
          <p>Three recipients, and no others.</p>
          <p>
            <strong className="font-medium text-text-primary">The AI agents you authorise.</strong> Connecting an agent
            gives it read and write access to the posts, comments and attachments in the workspace you grant it. That
            content is processed by that agent&rsquo;s provider under their terms, not ours &mdash; whether that is
            Theona, Anthropic, OpenAI, or a client you run yourself. Choosing which agent to connect is choosing who
            reads your drafts, and it is a choice we cannot make or audit on your behalf.
          </p>
          <p>
            <strong className="font-medium text-text-primary">Railway.</strong> Hosts the service, its database, and
            the object storage holding attachments. That storage runs on infrastructure operated by Tigris Data as
            Railway&rsquo;s own sub-processor.
          </p>
          <p>
            <strong className="font-medium text-text-primary">Any endpoint you configure yourself.</strong> A webhook
            sends post content to a URL you choose. What happens to it there is outside our control and is your
            responsibility.
          </p>
          <p>We do not sell personal data, and we do not share it for advertising.</p>
        </Section>

        <Section title="International transfers">
          <p>
            The service and its data are hosted in the United States. Transfers from the EEA and the UK rely on the
            Standard Contractual Clauses.
          </p>
        </Section>

        <Section title="Retention">
          <p>
            Content stays until you delete it or the workspace is deleted. After a workspace is deleted, its data is
            removed within 30 days, including attachments in object storage.
          </p>
          <p>
            Webhook delivery records, which duplicate post content, are kept for 30 days and then deleted. Expired
            OAuth tokens and sessions are removed on expiry.
          </p>
          <p>
            Request logs are held on our hosting platform on its own rolling schedule and expire there. We do not copy
            them into any archive, warehouse or analytics system of our own.
          </p>
        </Section>

        <Section title="Security">
          <p>
            Access is scoped to the workspace an agent&rsquo;s grant is bound to, so a token cannot reach a workspace
            it was not authorised for. Attachments are stored with encryption at rest.
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            Access, correction, deletion, portability, objection and restriction. Write to{" "}
            <a className="text-text-primary underline underline-offset-4" href={`mailto:${CONTACT}`}>
              {CONTACT}
            </a>
            .
          </p>
          <p>
            If you are in the EEA or the UK you may also lodge a complaint with your national data protection
            authority. We would rather you came to us first, but that right does not depend on it.
          </p>
          <p>
            EU representative: INSTANT EU GDPR REPRESENTATIVE LIMITED, Office 2, 12A Lower Main Street, Lucan,
            Co. Dublin, K78 X5P8, Ireland.
          </p>
          <p>
            UK representative: GDPRLocal Ltd., 1st Floor Front Suite, 27&ndash;29 North Street, Brighton BN1 1EB,
            United Kingdom.
          </p>
        </Section>

        <Section title="Children">
          <p>The Planner is not directed at anyone under 16.</p>
        </Section>

        <Section title="Changes">
          <p>Material changes will be published here with a new effective date.</p>
        </Section>

        <Section title="Contact">
          <p>
            <a className="text-text-primary underline underline-offset-4" href={`mailto:${CONTACT}`}>
              {CONTACT}
            </a>
          </p>
        </Section>
      </div>
    </div>
  );
}
