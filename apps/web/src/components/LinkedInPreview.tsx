import { toLinkedInPreview } from "@linkedin-planner/formatting";

export function LinkedInPreview({ content }: { content: string }) {
  const formatted = toLinkedInPreview(content);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-3">
        <div className="h-12 w-12 shrink-0 rounded-full bg-gray-300" />
        <div>
          <div className="text-sm font-semibold text-gray-900">Your Name</div>
          <div className="text-xs text-gray-500">Your headline</div>
          <div className="text-xs text-gray-400">Now · 🌐</div>
        </div>
      </div>
      <div className="whitespace-pre-wrap text-sm text-gray-900">
        {formatted || <span className="italic text-gray-400">Nothing to preview yet.</span>}
      </div>
      <div className="mt-4 flex items-center gap-6 border-t border-gray-100 pt-3 text-xs text-gray-500">
        <span>👍 Like</span>
        <span>💬 Comment</span>
        <span>🔁 Repost</span>
        <span>✉️ Send</span>
      </div>
    </div>
  );
}
