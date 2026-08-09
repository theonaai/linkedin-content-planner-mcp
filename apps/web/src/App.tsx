import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout.js";
import { DashboardView } from "./views/DashboardView.js";
import { PostDetailView } from "./views/PostDetailView.js";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardView />} />
          <Route path="posts/:id" element={<PostDetailView />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
