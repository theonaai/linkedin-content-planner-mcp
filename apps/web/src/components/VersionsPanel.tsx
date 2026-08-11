import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import type { DiffOp, PostVersion } from "../lib/types.js";
import { DiffView } from "./DiffView.js";

export function VersionsPanel({
  postId,
  versions,
  selectedVersionId,
  onSelectVersion,
  onReverted,
}: {
  postId: string;
  versions: PostVersion[];
  selectedVersionId: string | null;
  onSelectVersion: (id: string) => void;
  onReverted: () => void;
}) {
  const [diff, setDiff] = useState<DiffOp[] | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [reverting, setReverting] = useState<string | null>(null);

  const selectedIndex = versions.findIndex((v) => v.id === selectedVersionId);
  const previous = selectedIndex > 0 ? versions[selectedIndex - 1] : null;

  useEffect(() => {
    if (!selectedVersionId || !previous) {
      setDiff(null);
      return;
    }
    setDiffError(null);
    api
      .getVersionDiff(previous.id, selectedVersionId)
      .then(setDiff)
      .catch((err) => setDiffError(err instanceof Error ? err.message : String(err)));
  }, [selectedVersionId, previous?.id]);

  async function handleRevert(versionId: string) {
    setReverting(versionId);
    try {
      await api.revertToVersion(postId, versionId);
      onReverted();
    } finally {
      setReverting(null);
    }
  }

  const ordered = versions.slice().reverse();

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <div className="flex flex-col gap-2.5">
        {ordered.map((v, idx) => {
          const isLatest = idx === 0;
          const isSelected = v.id === selectedVersionId;
          return (
            <div
              key={v.id}
              onClick={() => onSelectVersion(v.id)}
              className={`flex cursor-pointer flex-col gap-1.5 rounded-xl border px-4 py-3.5 text-left ${
                isSelected ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] font-semibold text-text-primary">
                  Version {versions.length - idx} {isLatest && <span className="font-medium text-accent-text">(latest)</span>}
                </span>
                <span className="text-[11px] text-text-muted">{new Date(v.createdAt).toLocaleString()}</span>
              </div>
              <p className="truncate text-xs text-text-secondary">{v.contentMarkdown.split("\n")[0] || "(empty)"}</p>
              {!isLatest && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRevert(v.id);
                  }}
                  disabled={reverting === v.id}
                  className="self-start text-xs font-medium text-accent-text hover:underline disabled:opacity-40"
                >
                  {reverting === v.id ? "Reverting…" : "Revert to this version"}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex flex-col gap-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">
          {previous ? "Diff vs previous version" : "First version — nothing to diff"}
        </p>
        {diffError && <p className="text-xs text-red-600">{diffError}</p>}
        {diff && <DiffView ops={diff} />}
      </div>
    </div>
  );
}
