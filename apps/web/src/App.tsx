import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout.js";
import { BacklogView } from "./views/BacklogView.js";
import { CalendarView } from "./views/CalendarView.js";
import { PostDetailView } from "./views/PostDetailView.js";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<BacklogView />} />
          <Route path="calendar" element={<CalendarView />} />
          <Route path="posts/:id" element={<PostDetailView />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
