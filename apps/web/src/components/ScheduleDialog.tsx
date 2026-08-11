import { useState } from "react";
import { Modal } from "./Modal.js";

export function ScheduleDialog({
  currentDate,
  onSave,
  onRemove,
  onClose,
}: {
  currentDate: string | null;
  onSave: (date: string) => Promise<void>;
  onRemove: () => Promise<void>;
  onClose: () => void;
}) {
  const [date, setDate] = useState(currentDate ?? "");
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    if (!date) return;
    setBusy(true);
    try {
      await onSave(date);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setBusy(true);
    try {
      await onRemove();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={currentDate ? "Edit schedule" : "Schedule post"} onClose={onClose}>
      <label className="mb-2 block text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted" htmlFor="schedule-date-input">
        Publish date
      </label>
      <input
        id="schedule-date-input"
        type="date"
        autoFocus
        className="w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-sm text-text-primary outline-none focus:border-accent focus:bg-surface-1 focus:ring-4 focus:ring-accent-soft"
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />

      <div className="mt-4 flex items-center justify-between">
        {currentDate ? (
          <button
            onClick={handleRemove}
            disabled={busy}
            className="text-sm font-medium text-accent-text hover:underline disabled:opacity-40"
          >
            Remove schedule
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-full border border-border-strong px-3.5 py-1.5 text-sm text-text-primary hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={busy || !date}
            className="rounded-full bg-accent px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-40"
          >
            {currentDate ? "Save" : "Schedule post"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
