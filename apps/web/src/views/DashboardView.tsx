import { CalendarView } from "./CalendarView.js";
import { BacklogView } from "./BacklogView.js";

export function DashboardView() {
  return (
    <div className="flex flex-col gap-7">
      <CalendarView />
      <BacklogView />
    </div>
  );
}
