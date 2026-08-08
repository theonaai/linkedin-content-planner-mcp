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
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="flex flex-col gap-2">
        {ordered.map((v, idx) => {
          const isLatest = idx === 0;
          const isSelected = v.id === selectedVersionId;
          return (
            <div
              key={v.id}
              onClick={() => onSelectVersion(v.id)}
              className={`cursor-pointer rounded-md border px-3 py-2 text-left text-xs ${
                isSelected ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:bg-gray-50"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-700">
                  Version {versions.length - idx} {isLatest && "(latest)"}
                </span>
                <span className="text-gray-400">{new Date(v.createdAt).toLocaleString()}</span>
              </div>
              <p className="mt-1 truncate text-gray-500">{v.contentMarkdown.split("\n")[0] || "(empty)"}</p>
              {!isLatest && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRevert(v.id);
                  }}
                  disabled={reverting === v.id}
                  className="mt-1 text-[11px] text-blue-600 hover:underline disabled:opacity-40"
                >
                  {reverting === v.id ? "Reverting…" : "Revert to this version"}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          {previous ? "Diff vs previous version" : "First version — nothing to diff"}
        </p>
        {diffError && <p className="text-xs text-red-600">{diffError}</p>}
        {diff && <DiffView ops={diff} />}
      </div>
    </div>
  );
}
