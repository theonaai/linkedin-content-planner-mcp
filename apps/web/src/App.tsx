import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout.js";
import { DashboardView } from "./views/DashboardView.js";
import { PostDetailView } from "./views/PostDetailView.js";
import { WebhooksView } from "./views/WebhooksView.js";
import { TeamView } from "./views/TeamView.js";
import { ConnectView } from "./views/ConnectView.js";
import { PrivacyView } from "./views/PrivacyView.js";
import { AuthProvider } from "./auth/AuthProvider.js";
import { AuthGate } from "./auth/AuthGate.js";

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public. The router now sits above `AuthGate` rather than inside it, so a route can
              opt out of the login wall. A privacy policy only a logged-in user can read is not
              published, and both app directories require a reachable policy URL from reviewers
              who have no account here. Everything else stays gated exactly as before. */}
          <Route path="privacy" element={<PrivacyView />} />
          <Route
            element={
              <AuthGate>
                <Layout />
              </AuthGate>
            }
          >
            <Route index element={<DashboardView />} />
            <Route path="posts/:id" element={<PostDetailView />} />
            <Route path="connect" element={<ConnectView />} />
            <Route path="webhooks" element={<WebhooksView />} />
            <Route path="team" element={<TeamView />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
