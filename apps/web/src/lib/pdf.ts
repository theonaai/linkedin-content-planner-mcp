import type { PDFDocumentProxy } from "pdfjs-dist";
// The ?url suffix hands the worker to Vite to resolve, serve in dev and emit as its own asset
// in a build. Constructing the URL by hand instead points at a path inside the pnpm store that
// the dev server refuses to serve, and the viewer silently falls back to no preview at all.
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

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
 * Cancellable, and callers must cancel: pdf.js refuses to run two renders against one canvas
 * ("Cannot use the same canvas during multiple render() operations"), and two renders is the
 * normal case, not an edge one. React re-runs the effect whenever the page number changes, and
 * StrictMode runs every effect twice on mount, so without a real cancel the second render loses
 * the race and the tile shows an error instead of a slide.
 */
export function renderPdfPage(
  canvas: HTMLCanvasElement,
  url: string,
  pageNumber: number,
  maxWidth: number,
): PdfRenderHandle {
  let cancelled = false;
  let task: { cancel: () => void } | null = null;

  const done = (async () => {
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
  })();

  return {
    done,
    cancel: () => {
      cancelled = true;
      task?.cancel();
    },
  };
}
