import { useCallback, useEffect, useRef, useState } from "react";
import { attachmentsApi, formatBytes, type Attachment } from "../lib/attachments.js";
import { MAX_ATTACHMENT_BYTES } from "../lib/limits.js";

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
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError(`${file.name} is ${formatBytes(file.size)} — attachments are capped at 25 MB.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
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

  const browseButton = (
    <button
      onClick={() => fileInputRef.current?.click()}
      disabled={uploading}
      className="rounded-full border border-border-strong bg-surface-1 px-4 py-2 text-[13px] font-medium text-text-primary hover:bg-surface-2 disabled:opacity-40"
    >
      {uploading ? "Uploading…" : "Browse files"}
    </button>
  );

  return (
    <div>
      <input ref={fileInputRef} type="file" onChange={handleFileChange} disabled={uploading} className="hidden" />
      {error && <p className="mb-2.5 text-xs text-red-600">{error}</p>}
      {loading ? (
        <p className="text-xs text-text-muted">Loading…</p>
      ) : attachments.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border-strong bg-surface-2 py-11">
          <p className="text-sm text-text-secondary">No attachments yet — drop an image, carousel or video here.</p>
          {browseButton}
          <span className="text-xs text-text-muted">Carousels, images, PDFs — up to 25 MB</span>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-3">
            {browseButton}
            <span className="text-xs text-text-muted">Carousels, images, PDFs — up to 25 MB</span>
          </div>
          {attachments.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-xl border border-border px-4 py-3 text-sm">
              <div>
                <a
                  href={attachmentsApi.downloadUrl(a.id)}
                  className="font-medium text-text-primary hover:underline"
                  download={a.filename}
                >
                  {a.filename}
                </a>
                <p className="text-xs text-text-muted">
                  {a.mimeType} · {formatBytes(a.sizeBytes)}
                </p>
              </div>
              <button onClick={() => handleDelete(a.id)} className="text-xs font-medium text-accent-text hover:underline">
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
