import { useCallback, useEffect, useRef, useState } from "react";
import { attachmentsApi, formatBytes, type Attachment } from "../lib/attachments.js";

export function AttachmentsPanel({ postId }: { postId: string }) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAttachments(await attachmentsApi.list(postId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await attachmentsApi.upload(postId, file);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(id: string) {
    try {
      await attachmentsApi.remove(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileChange}
          disabled={uploading}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          📎 {uploading ? "Uploading…" : "Attach file"}
        </button>
        <span className="text-xs text-gray-400">Carousels, images, PDFs — up to 25 MB</span>
      </div>
      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
      {loading ? (
        <p className="text-xs text-gray-400">Loading…</p>
      ) : attachments.length === 0 ? (
        <p className="text-xs text-gray-400">No attachments yet. Click “Attach file” to add one.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {attachments.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm"
            >
              <div>
                <a
                  href={attachmentsApi.downloadUrl(a.id)}
                  className="font-medium text-gray-900 hover:underline"
                  download={a.filename}
                >
                  {a.filename}
                </a>
                <p className="text-xs text-gray-400">
                  {a.mimeType} · {formatBytes(a.sizeBytes)}
                </p>
              </div>
              <button onClick={() => handleDelete(a.id)} className="text-xs text-red-600 hover:underline">
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
