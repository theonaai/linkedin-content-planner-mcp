import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import { useAuth } from "../auth/AuthProvider.js";
import type { Post, PostState } from "./types.js";

export interface PostWithSnippet extends Post {
  snippet: string;
}

function toSnippet(markdown: string): string {
  const firstLine = markdown.split("\n").find((line) => line.trim().length > 0) ?? "";
  return firstLine.length > 140 ? `${firstLine.slice(0, 140)}…` : firstLine;
}

export function usePostsWithSnippets(states?: PostState[]) {
  // Every list request implicitly scopes to whatever workspace is "active" right now (sent as
  // the x-workspace-id header — see lib/workspace.ts) rather than taking a workspace id as an
  // argument, so switching the active workspace elsewhere in the app must also be a dependency
  // here. Without it, this hook only fetches once on mount and keeps showing the previous
  // workspace's posts until a full page reload.
  const { activeWorkspaceId } = useAuth();
  const statesKey = states?.join(",") ?? "";
  const [posts, setPosts] = useState<PostWithSnippet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.listPosts(states ? { states } : undefined);
      const withSnippets = await Promise.all(
        list.map(async (post) => {
          const versions = await api.listVersions(post.id);
          const latest = versions[versions.length - 1];
          return { ...post, snippet: latest ? toSnippet(latest.contentMarkdown) : "" };
        }),
      );
      setPosts(withSnippets);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
    // statesKey is the stable identity for the states filter; states itself is a fresh array each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statesKey]);

  useEffect(() => {
    reload();
  }, [reload, activeWorkspaceId]);

  return { posts, loading, error, reload };
}
