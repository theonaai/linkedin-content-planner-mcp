import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePostsWithSnippets } from "../lib/usePostsWithSnippets.js";
import { STATE_BADGE_CLASSES } from "../lib/stateMachine.js";

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getMonthGridDays(year: number, month: number): Date[] {
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7; // Monday-first grid
  const start = new Date(year, month, 1 - startOffset);
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarView() {
  const { posts, loading, error } = usePostsWithSnippets();
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const days = useMemo(() => getMonthGridDays(cursor.getFullYear(), cursor.getMonth()), [cursor]);

  const postsByDate = useMemo(() => {
    const map = new Map<string, typeof posts>();
    for (const post of posts) {
      if (!post.scheduledDate) continue;
      const key = post.scheduledDate.slice(0, 10);
      const bucket = map.get(key) ?? [];
      bucket.push(post);
      map.set(key, bucket);
    }
    return map;
  }, [posts]);

  const todayKey = toDateKey(new Date());
  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">{monthLabel}</h1>
        <div className="flex gap-2">
          <button
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
            onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
          >
            ← Prev
          </button>
          <button
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
            onClick={() => {
              const now = new Date();
              setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
            }}
          >
            Today
          </button>
          <button
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
            onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
          >
            Next →
          </button>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-500">
            {WEEKDAYS.map((d) => (
              <div key={d} className="px-2 py-1.5">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const key = toDateKey(day);
              const inMonth = day.getMonth() === cursor.getMonth();
              const dayPosts = postsByDate.get(key) ?? [];
              return (
                <div
                  key={key}
                  className={`min-h-[6rem] border-b border-r border-gray-100 p-1 ${
                    inMonth ? "bg-white" : "bg-gray-50"
                  }`}
                >
                  <div
                    className={`mb-1 text-xs ${
                      key === todayKey
                        ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-900 text-white"
                        : inMonth
                          ? "text-gray-700"
                          : "text-gray-300"
                    }`}
                  >
                    {day.getDate()}
                  </div>
                  <div className="flex flex-col gap-1">
                    {dayPosts.map((post) => (
                      <Link
                        key={post.id}
                        to={`/posts/${post.id}`}
                        className={`block truncate rounded px-1 py-0.5 text-[11px] ${STATE_BADGE_CLASSES[post.state]}`}
                        title={post.snippet}
                      >
                        {post.snippet || "(empty)"}
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
