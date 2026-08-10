import type {
  Comment,
  DiffOp,
  Platform,
  Post,
  PostState,
  PostVersion,
  Review,
  ReviewDecision,
  Webhook,
  WebhookDelivery,
  WebhookEvent,
} from "./types.js";

const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Only set Content-Type when actually sending a body — Fastify's JSON parser rejects a
  // Content-Type: application/json request with an empty body (as a bodyless DELETE sends).
  const res = await fetch(`${BASE}${path}`, {
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  listPosts(params?: { states?: PostState[] }) {
    const qs = new URLSearchParams();
    params?.states?.forEach((s) => qs.append("state", s));
    const query = qs.toString();
    return request<Post[]>(`/posts${query ? `?${query}` : ""}`);
  },
  getPost: (id: string) => request<Post>(`/posts/${id}`),
  createPost: (input: { platform?: Platform; initialContent?: string }) =>
    request<Post>("/posts", { method: "POST", body: JSON.stringify(input) }),
  setPostState: (id: string, toState: PostState) =>
    request<Post>(`/posts/${id}/state`, { method: "PATCH", body: JSON.stringify({ toState }) }),
  setPostDate: (id: string, scheduledDate: string | null) =>
    request<Post>(`/posts/${id}/date`, { method: "PATCH", body: JSON.stringify({ scheduledDate }) }),
  deletePost: (id: string) => request<void>(`/posts/${id}`, { method: "DELETE" }),

  listVersions: (postId: string) => request<PostVersion[]>(`/posts/${postId}/versions`),
  updateContent: (postId: string, contentMarkdown: string) =>
    request<PostVersion>(`/posts/${postId}/versions`, {
      method: "POST",
      body: JSON.stringify({ contentMarkdown }),
    }),
  revertToVersion: (postId: string, versionId: string) =>
    request<PostVersion>(`/posts/${postId}/versions/revert`, {
      method: "POST",
      body: JSON.stringify({ versionId }),
    }),
  getVersionDiff: (versionIdA: string, versionIdB: string) =>
    request<DiffOp[]>(`/versions/diff?versionIdA=${versionIdA}&versionIdB=${versionIdB}`),

  listReviews: (postId: string) => request<Review[]>(`/posts/${postId}/reviews`),
  submitReview: (postId: string, decision: ReviewDecision, body?: string) =>
    request<Review>(`/posts/${postId}/reviews`, {
      method: "POST",
      body: JSON.stringify({ decision, body }),
    }),

  listCommentsForPost: (postId: string) => request<Comment[]>(`/posts/${postId}/comments`),
  addComment: (
    versionId: string,
    input: { body: string; anchorOffset?: number; anchorLength?: number; parentCommentId?: string },
  ) => request<Comment>(`/versions/${versionId}/comments`, { method: "POST", body: JSON.stringify(input) }),
  resolveComment: (id: string, resolved: boolean) =>
    request<Comment>(`/comments/${id}/resolve`, { method: "PATCH", body: JSON.stringify({ resolved }) }),

  listWebhooks: () => request<Webhook[]>("/webhooks"),
  createWebhook: (input: { url: string; events: WebhookEvent[]; secret?: string }) =>
    request<Webhook>("/webhooks", { method: "POST", body: JSON.stringify(input) }),
  updateWebhook: (
    id: string,
    input: Partial<{ url: string; events: WebhookEvent[]; secret: string | null; active: boolean }>,
  ) => request<Webhook>(`/webhooks/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  deleteWebhook: (id: string) => request<void>(`/webhooks/${id}`, { method: "DELETE" }),
  listWebhookDeliveries: (id: string) => request<WebhookDelivery[]>(`/webhooks/${id}/deliveries`),
};
