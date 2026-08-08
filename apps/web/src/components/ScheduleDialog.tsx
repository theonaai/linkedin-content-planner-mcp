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
      <label className="mb-1 block text-xs font-medium text-gray-500" htmlFor="schedule-date-input">
        Publish date
      </label>
      <input
        id="schedule-date-input"
        type="date"
        autoFocus
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />

      <div className="mt-4 flex items-center justify-between">
        {currentDate ? (
          <button
            onClick={handleRemove}
            disabled={busy}
            className="text-sm text-red-600 hover:underline disabled:opacity-40"
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
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={busy || !date}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            {currentDate ? "Save" : "Schedule post"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
