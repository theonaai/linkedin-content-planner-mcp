/** What the file turned out to be when the server sniffed its bytes, which is not always what
 * mimeType claims: an mp4 uploaded with curl arrives as application/octet-stream. null means
 * the server will not serve it inline, so it stays a download-only row. */
export type PreviewKind = "image" | "video" | "pdf";

export interface Attachment {
  id: string;
  postId: string;
  storageKey: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  previewKind: PreviewKind | null;
}

export const attachmentsApi = {
  list: (postId: string) => fetch(`/api/posts/${postId}/attachments`).then((r) => r.json() as Promise<Attachment[]>),

  async upload(postId: string, file: File): Promise<Attachment> {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/posts/${postId}/attachments`, { method: "POST", body: form });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error ?? `Upload failed: ${res.status}`);
    }
    return res.json();
  },

  async remove(id: string): Promise<void> {
    const res = await fetch(`/api/attachments/${id}`, { method: "DELETE" });
    if (!res.ok && res.status !== 204) {
      throw new Error(`Delete failed: ${res.status}`);
    }
  },

  downloadUrl: (id: string) => `/api/attachments/${id}/download`,

  previewUrl: (id: string) => `/api/attachments/${id}/preview`,
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
