import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { toLinkedInPreview } from "@linkedin-planner/formatting";
import { CommentIcon, GlobeIcon, RepostIcon, SendIcon, ThumbsUpIcon, UserAvatarIcon } from "./icons.js";

const LINKEDIN_BLUE = "#0a66c2";
const TEXT_CLASSES = "whitespace-pre-wrap text-sm leading-normal text-gray-900";

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

/** Binary-searches the character offset where `fullText` would wrap onto a 4th line,
 * using a same-width/font hidden element as the ruler. Returns null if it already fits. */
function findClampCutoff(measureEl: HTMLDivElement, fullText: string, maxHeight: number): number | null {
  measureEl.textContent = fullText;
  if (measureEl.getBoundingClientRect().height <= maxHeight + 1) return null;

  let lo = 0;
  let hi = fullText.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    measureEl.textContent = fullText.slice(0, mid);
    const fits = measureEl.getBoundingClientRect().height <= maxHeight + 1;
    if (fits) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function LinkedInPreview({ content }: { content: string }) {
  const formatted = toLinkedInPreview(content);
  const clampRulerRef = useRef<HTMLDivElement>(null);
  const measureRulerRef = useRef<HTMLDivElement>(null);
  const [cutoff, setCutoff] = useState<number | null>(null);

  useLayoutEffect(() => {
    const clampEl = clampRulerRef.current;
    const measureEl = measureRulerRef.current;
    if (!clampEl || !measureEl || !formatted) {
      setCutoff(null);
      return;
    }
    setCutoff(findClampCutoff(measureEl, formatted, clampEl.clientHeight));
  }, [formatted]);

  const visibleText = cutoff === null ? formatted : formatted.slice(0, cutoff);
  const hiddenText = cutoff === null ? "" : formatted.slice(cutoff);

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

      <div className="relative px-4 pb-1 pt-3">
        {/* Invisible rulers, laid out at the same width as the visible text, used only to
            measure where LinkedIn's real 3-line clamp would cut this content. */}
        <div ref={clampRulerRef} aria-hidden className={`${TEXT_CLASSES} invisible absolute inset-x-4 top-0 -z-10 line-clamp-3`}>
          {formatted}
        </div>
        <div ref={measureRulerRef} aria-hidden className={`${TEXT_CLASSES} invisible absolute inset-x-4 top-0 -z-10`} />

        {formatted ? (
          <>
            <div className="relative">
              <div className={TEXT_CLASSES}>{renderWithHashtags(visibleText)}</div>
              {cutoff !== null && (
                <span className="absolute bottom-0 right-0 bg-white pl-1 text-sm font-medium text-gray-500">
                  …more
                </span>
              )}
            </div>
            {cutoff !== null && (
              <>
                <div className="my-2 border-t border-dashed border-gray-300" />
                <div className={TEXT_CLASSES}>{renderWithHashtags(hiddenText)}</div>
              </>
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
