import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePostsWithSnippets } from "../lib/usePostsWithSnippets.js";
import { STATE_CARD_CLASSES } from "../lib/stateMachine.js";

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

const navButtonClass =
  "rounded-full border border-border-strong bg-surface-1 px-4 py-2 text-[13px] font-medium text-text-secondary hover:border-text-muted hover:text-text-primary";

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
      <div className="mb-4 flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">Content calendar</p>
          <h1 className="text-[34px] font-light leading-[1.1] tracking-tight text-text-primary">{monthLabel}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button className={navButtonClass} onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}>
            ← Prev
          </button>
          <button
            className="rounded-full border border-border-strong bg-surface-1 px-4.5 py-2 text-[13px] font-semibold text-text-primary hover:border-text-muted"
            onClick={() => {
              const now = new Date();
              setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
            }}
          >
            Today
          </button>
          <button className={navButtonClass} onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}>
            Next →
          </button>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface-1 shadow-card">
          <div className="grid grid-cols-7 border-b border-border bg-surface-2">
            {WEEKDAYS.map((d) => (
              <div key={d} className="px-3.5 py-3 text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day, i) => {
              const key = toDateKey(day);
              const inMonth = day.getMonth() === cursor.getMonth();
              const isToday = inMonth && key === todayKey;
              const dayPosts = postsByDate.get(key) ?? [];
              return (
                <div
                  key={key}
                  className={`flex min-h-[126px] flex-col gap-2 p-2.5 ${i % 7 !== 6 ? "border-r border-border" : ""} ${
                    i < 35 ? "border-b border-border" : ""
                  } ${inMonth ? (isToday ? "bg-accent-soft" : "bg-surface-1") : "bg-surface-2"}`}
                >
                  <div
                    className={
                      isToday
                        ? "flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white"
                        : `px-0.5 py-1 text-xs font-medium ${inMonth ? "text-text-secondary" : "text-text-muted/60"}`
                    }
                  >
                    {day.getDate()}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {dayPosts.map((post) => (
                      <Link
                        key={post.id}
                        to={`/posts/${post.id}`}
                        className={`block truncate rounded-lg border border-l-[3px] px-2.5 py-1.5 text-[12px] font-medium leading-snug text-text-primary ${STATE_CARD_CLASSES[post.state]}`}
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
