import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { toLinkedInPreview } from "@linkedin-planner/formatting";
import { CommentIcon, GlobeIcon, RepostIcon, SendIcon, ThumbsUpIcon, UserAvatarIcon } from "./icons.js";

const LINKEDIN_BLUE = "#0a66c2";

const HASHTAG_SPLIT = /(#[\p{L}\p{N}_]+)/gu;
const HASHTAG_MATCH = /^#[\p{L}\p{N}_]+$/u;

function renderWithHashtags(text: string): ReactNode[] {
  return text.split(HASHTAG_SPLIT).map((part, i) =>
    HASHTAG_MATCH.test(part) ? (
      <span key={i} style={{ color: LINKEDIN_BLUE }} className="font-medium">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

export function LinkedInPreview({ content }: { content: string }) {
  const formatted = toLinkedInPreview(content);
  const contentRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useLayoutEffect(() => {
    setExpanded(false);
  }, [formatted]);

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el || expanded) return;
    setIsOverflowing(el.scrollHeight > el.clientHeight + 1);
  }, [formatted, expanded]);

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex items-start gap-2 px-4 pt-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200 text-gray-400">
          <UserAvatarIcon className="h-9 w-9" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold leading-tight text-gray-900">Your Name</div>
          <div className="truncate text-xs leading-tight text-gray-500">Your headline</div>
          <div className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
            <span>Now</span>
            <span>·</span>
            <GlobeIcon className="h-3 w-3" />
          </div>
        </div>
      </div>

      <div className="px-4 pb-1 pt-3">
        {formatted ? (
          <>
            <div
              ref={contentRef}
              className={`whitespace-pre-wrap text-sm leading-normal text-gray-900 ${expanded ? "" : "line-clamp-3"}`}
            >
              {renderWithHashtags(formatted)}
            </div>
            {isOverflowing && !expanded && (
              <button
                onClick={() => setExpanded(true)}
                className="mt-0.5 text-sm font-medium text-gray-500 hover:underline"
              >
                …more
              </button>
            )}
          </>
        ) : (
          <p className="text-sm italic text-gray-400">Nothing to preview yet.</p>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between px-4 pb-2 text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#0a66c2] text-white ring-2 ring-white">
            <ThumbsUpIcon className="h-2.5 w-2.5" strokeWidth={2.5} />
          </span>
          <span className="-ml-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#df704c] text-white ring-2 ring-white">
            ❤
          </span>
          <span className="ml-1">57</span>
        </div>
        <div>24 comments · 6 reposts</div>
      </div>

      <div className="grid grid-cols-4 gap-1 border-t border-gray-100 px-2 py-1">
        {[
          { icon: ThumbsUpIcon, label: "Like" },
          { icon: CommentIcon, label: "Comment" },
          { icon: RepostIcon, label: "Repost" },
          { icon: SendIcon, label: "Send" },
        ].map(({ icon: ActionIcon, label }) => (
          <button
            key={label}
            className="flex items-center justify-center gap-1.5 rounded-md py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            <ActionIcon className="h-5 w-5" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
