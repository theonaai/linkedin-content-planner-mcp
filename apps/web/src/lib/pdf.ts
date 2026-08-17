import type { PDFDocumentProxy } from "pdfjs-dist";
// The ?url suffix hands the worker to Vite to resolve, serve in dev and emit as its own asset
// in a build. Constructing the URL by hand instead points at a path inside the pnpm store that
// the dev server refuses to serve, and the viewer silently falls back to no preview at all.
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { createRenderQueue } from "./renderQueue.js";

/**
 * pdf.js is roughly a megabyte, and most of what the planner shows is text, images and video.
 * Loading it on demand keeps it out of the main bundle, so it costs nothing until someone
 * actually opens a post carrying a carousel.
 */
let pdfjsModule: Promise<typeof import("pdfjs-dist")> | null = null;

function getPdfjs(): Promise<typeof import("pdfjs-dist")> {
  if (!pdfjsModule) {
    pdfjsModule = import("pdfjs-dist").then((module) => {
      // pdf.js parses documents on a worker thread, which is what keeps a 25 MB carousel from
      // blocking the UI while it is decoded.
      module.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      return module;
    });
  }
  return pdfjsModule;
}

/** One queue for the whole app, keyed by canvas, so two components drawing into two canvases
 * never wait on each other. */
const renderQueue = createRenderQueue<HTMLCanvasElement>();

const documents = new Map<string, Promise<PDFDocumentProxy>>();

/** One parsed document per URL, shared between the tile and the lightbox so opening a carousel
 * that is already on screen does not fetch and parse it a second time. */
export function loadPdf(url: string): Promise<PDFDocumentProxy> {
  const cached = documents.get(url);
  if (cached) return cached;
  const task = getPdfjs().then((pdfjs) => pdfjs.getDocument({ url, withCredentials: true }).promise);
  documents.set(url, task);
  // A failed parse must not be cached: the next attempt should be able to retry.
  task.catch(() => documents.delete(url));
  return task;
}

export class RenderCancelled extends Error {
  constructor() {
    super("Render cancelled");
    this.name = "RenderCancelled";
  }
}

export interface PdfRenderHandle {
  done: Promise<{ pageCount: number }>;
  cancel: () => void;
}

/**
 * Draws one page into a canvas, scaled to fit `maxWidth` while staying sharp on retina screens.
 * Returns the page count so callers can show "3 / 5" without loading the document twice.
 *
 * Two renders against one canvas is the normal case here, not an edge one: React re-runs the
 * effect whenever the page number changes, and StrictMode runs every effect twice on mount.
 * pdf.js refuses to run them concurrently ("Cannot use the same canvas during multiple render()
 * operations"), so the overlap is handled twice over:
 *
 * - Renders on a canvas are queued, so the next one starts only after the previous has settled.
 *   Cancelling alone is not enough, because pdf.js's `cancel()` is cooperative and returns
 *   before the task has released the canvas.
 * - Callers still cancel on cleanup, which stops a superseded render early rather than spending
 *   frames drawing a page nobody will see.
 *
 * The queue is what makes the outcome correct; cancelling is what makes it cheap.
 */
export function renderPdfPage(
  canvas: HTMLCanvasElement,
  url: string,
  pageNumber: number,
  maxWidth: number,
): PdfRenderHandle {
  let cancelled = false;
  let task: { cancel: () => void } | null = null;

  const done = renderQueue.enqueue(canvas, async () => {
    // Queued rather than started: see renderQueue for why cancelling the previous render is not
    // enough on its own. Cancellation still matters, and the caller should still cancel, because
    // it stops a superseded render early instead of drawing a page nobody is looking at.
    if (cancelled) throw new RenderCancelled();

    const doc = await loadPdf(url);
    if (cancelled) throw new RenderCancelled();

    const page = await doc.getPage(Math.min(Math.max(pageNumber, 1), doc.numPages));
    if (cancelled) throw new RenderCancelled();

    const unscaled = page.getViewport({ scale: 1 });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const viewport = page.getViewport({ scale: (maxWidth / unscaled.width) * dpr });

    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = "100%";
    canvas.style.height = "auto";

    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D context unavailable");

    const renderTask = page.render({ canvas, canvasContext: context, viewport });
    task = renderTask;
    try {
      await renderTask.promise;
    } catch (err) {
      // pdf.js signals a cancelled render by rejecting; that is an expected outcome here, not
      // a failure worth showing anyone.
      if (cancelled || (err as Error)?.name === "RenderingCancelledException") throw new RenderCancelled();
      throw err;
    }
    return { pageCount: doc.numPages };
  });

  return {
    done,
    cancel: () => {
      cancelled = true;
      task?.cancel();
    },
  };
}
