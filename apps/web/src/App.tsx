import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout.js";
import { DashboardView } from "./views/DashboardView.js";
import { PostDetailView } from "./views/PostDetailView.js";
import { WebhooksView } from "./views/WebhooksView.js";
import { TeamView } from "./views/TeamView.js";
import { ConnectView } from "./views/ConnectView.js";
import { AuthProvider } from "./auth/AuthProvider.js";
import { AuthGate } from "./auth/AuthGate.js";

export function App() {
  return (
    <AuthProvider>
      <AuthGate>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<DashboardView />} />
              <Route path="posts/:id" element={<PostDetailView />} />
              <Route path="connect" element={<ConnectView />} />
              <Route path="webhooks" element={<WebhooksView />} />
              <Route path="team" element={<TeamView />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthGate>
    </AuthProvider>
  );
}
