import { useCallback, useEffect, useRef, useState } from "react";
import { attachmentsApi, type Attachment } from "../lib/attachments.js";
import { renderPdfPage, RenderCancelled } from "../lib/pdf.js";

/** One PDF page drawn to a canvas. Used both for the tile (page 1, small) and the lightbox
 * (any page, large), so a carousel looks the same in both places. */
export function PdfPage({
  url,
  pageNumber,
  width,
  onPageCount,
  className,
}: {
  url: string;
  pageNumber: number;
  width: number;
  onPageCount?: (count: number) => void;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setFailed(null);
    setDrawn(false);
    const handle = renderPdfPage(canvas, url, pageNumber, width);
    handle.done
      .then(({ pageCount }) => {
        setDrawn(true);
        onPageCount?.(pageCount);
      })
      .catch((err: unknown) => {
        // A superseded render is expected and says nothing about this page. Anything else is
        // reported: an unexplained blank canvas is the worst of the possible outcomes.
        if (err instanceof RenderCancelled) return;
        setFailed(err instanceof Error ? err.message : String(err));
      });
    return handle.cancel;
  }, [url, pageNumber, width, onPageCount]);

  if (failed) {
    return (
      <div className="flex h-full items-center justify-center px-2 text-center text-xs text-text-muted" title={failed}>
        Cannot render PDF
      </div>
    );
  }
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <canvas ref={canvasRef} className={className} />
      {/* Until the first paint lands, say so. Otherwise a page that is still decoding and a page
          that failed to decode look identical: both are a blank rectangle. */}
      {!drawn && (
        <span className="pointer-events-none absolute text-xs text-text-muted" role="status">
          Rendering…
        </span>
      )}
    </div>
  );
}

function PageCounter({ current, total }: { current: number; total: number }) {
  return (
    <span className="rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-medium text-white">
      {current} / {total}
    </span>
  );
}

/** The tile shown in the attachments grid. */
export function AttachmentTile({ attachment, onOpen }: { attachment: Attachment; onOpen: () => void }) {
  const [pageCount, setPageCount] = useState<number | null>(null);
  const url = attachmentsApi.previewUrl(attachment.id);

  const body = (() => {
    switch (attachment.previewKind) {
      case "image":
        return <img src={url} alt={attachment.filename} loading="lazy" className="h-full w-full object-cover" />;
      case "video":
        return (
          <>
            {/* preload="metadata" fetches only the header, and the #t=0.1 fragment makes the
                element paint a real frame instead of a black rectangle. */}
            <video src={`${url}#t=0.1`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white">▶</span>
            </span>
          </>
        );
      case "pdf":
        return (
          <div className="flex h-full w-full items-center justify-center overflow-hidden bg-white p-1.5">
            <PdfPage url={url} pageNumber={1} width={320} onPageCount={setPageCount} className="max-h-full" />
          </div>
        );
      default:
        return (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-3 text-center">
            <span className="text-2xl">📄</span>
            <span className="text-[11px] text-text-muted">No inline preview</span>
          </div>
        );
    }
  })();

  const previewable = attachment.previewKind !== null;

  return (
    <button
      type="button"
      onClick={previewable ? onOpen : undefined}
      aria-label={previewable ? `Open ${attachment.filename}` : attachment.filename}
      className={`relative block aspect-square w-full overflow-hidden rounded-xl border border-border bg-surface-2 ${
        previewable ? "cursor-zoom-in hover:border-border-strong" : "cursor-default"
      }`}
    >
      {body}
      {attachment.previewKind === "pdf" && pageCount !== null && (
        <span className="absolute bottom-2 right-2">
          <PageCounter current={1} total={pageCount} />
        </span>
      )}
    </button>
  );
}

/** Full-size view. Images and video are native elements; a PDF gets a pager, because a carousel
 * is reviewed slide by slide — the first one has to work as the hook and the last one carries
 * the call to action. */
export function AttachmentLightbox({ attachment, onClose }: { attachment: Attachment; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const url = attachmentsApi.previewUrl(attachment.id);

  const step = useCallback(
    (delta: number) => setPage((p) => Math.min(Math.max(p + delta, 1), pageCount)),
    [pageCount],
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (attachment.previewKind !== "pdf") return;
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, step, attachment.previewKind]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/80 p-4" onClick={onClose}>
      <div className="flex items-center justify-between pb-3 text-white">
        <span className="truncate text-sm font-medium">{attachment.filename}</span>
        <div className="flex items-center gap-3">
          <a
            href={attachmentsApi.downloadUrl(attachment.id)}
            download={attachment.filename}
            onClick={(e) => e.stopPropagation()}
            className="text-xs underline underline-offset-2 hover:text-white/80"
          >
            Download
          </a>
          <button onClick={onClose} aria-label="Close preview" className="text-lg leading-none hover:text-white/80">
            ✕
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center" onClick={(e) => e.stopPropagation()}>
        {attachment.previewKind === "image" && (
          <img src={url} alt={attachment.filename} className="max-h-full max-w-full object-contain" />
        )}
        {attachment.previewKind === "video" && (
          <video src={url} controls autoPlay playsInline className="max-h-full max-w-full" />
        )}
        {attachment.previewKind === "pdf" && (
          <div className="flex h-full w-full max-w-3xl flex-col items-center justify-center gap-3">
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-white">
              <PdfPage url={url} pageNumber={page} width={900} onPageCount={setPageCount} className="max-h-full" />
            </div>
            <div className="flex items-center gap-4 text-white">
              <button
                onClick={() => step(-1)}
                disabled={page <= 1}
                className="rounded-full border border-white/30 px-3 py-1 text-sm disabled:opacity-30"
              >
                ←
              </button>
              <PageCounter current={page} total={pageCount} />
              <button
                onClick={() => step(1)}
                disabled={page >= pageCount}
                className="rounded-full border border-white/30 px-3 py-1 text-sm disabled:opacity-30"
              >
                →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
