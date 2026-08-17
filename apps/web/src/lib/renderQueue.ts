/**
 * Runs work strictly one-at-a-time per key, while keeping different keys independent.
 *
 * This exists for one reason: pdf.js refuses to run two renders against the same canvas, and
 * its `cancel()` is cooperative rather than synchronous. Cancelling a render returns before the
 * task has actually released the canvas, so code that cancels and immediately starts the next
 * render is racing an unobservable deadline. Chaining per canvas removes the race instead of
 * making the window smaller: the next render begins only once the previous one has settled,
 * however it settled.
 */
export function createRenderQueue<K extends object>() {
  const tails = new WeakMap<K, Promise<unknown>>();

  return {
    /**
     * Queues `work` behind anything already queued for `key`. The returned promise settles with
     * `work`'s own result; a rejection does not poison the queue for later callers.
     */
    enqueue<T>(key: K, work: () => Promise<T>): Promise<T> {
      const previous = tails.get(key) ?? Promise.resolve();
      // Swallowing here only detaches the chain from the previous result — the caller still
      // sees its own rejection through the promise it was handed.
      const result = previous.then(work, work);
      tails.set(
        key,
        result.then(
          () => undefined,
          () => undefined,
        ),
      );
      return result;
    },
  };
}
