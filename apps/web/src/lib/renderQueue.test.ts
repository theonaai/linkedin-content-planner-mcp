import { describe, it, expect } from "vitest";
import { createRenderQueue } from "./renderQueue.js";

/** A promise plus the handles to settle it later, so a test can control interleaving exactly. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const KEY_A = { id: "canvas-a" };
const KEY_B = { id: "canvas-b" };

describe("createRenderQueue", () => {
  it("does not start the second job on a key until the first has settled", async () => {
    const queue = createRenderQueue<object>();
    const first = deferred<string>();
    const events: string[] = [];

    const firstDone = queue.enqueue(KEY_A, async () => {
      events.push("first:start");
      const value = await first.promise;
      events.push("first:end");
      return value;
    });
    const secondDone = queue.enqueue(KEY_A, async () => {
      events.push("second:start");
      return "second";
    });

    // This is the assertion the PDF pager depends on: the second render must not have touched
    // the canvas while the first was still in flight.
    await Promise.resolve();
    expect(events).toEqual(["first:start"]);

    first.resolve("first");
    await expect(firstDone).resolves.toBe("first");
    await expect(secondDone).resolves.toBe("second");
    expect(events).toEqual(["first:start", "first:end", "second:start"]);
  });

  it("keeps running later jobs after an earlier one rejects", async () => {
    const queue = createRenderQueue<object>();
    const failing = deferred<never>();

    const firstDone = queue.enqueue(KEY_A, () => failing.promise);
    const secondDone = queue.enqueue(KEY_A, async () => "recovered");

    failing.reject(new Error("cancelled"));

    // The caller still sees its own rejection, and the queue is not poisoned by it: a cancelled
    // render is the normal case here, and the page after it still has to draw.
    await expect(firstDone).rejects.toThrow("cancelled");
    await expect(secondDone).resolves.toBe("recovered");
  });

  it("runs different keys concurrently", async () => {
    const queue = createRenderQueue<object>();
    const blocked = deferred<string>();
    const events: string[] = [];

    const aDone = queue.enqueue(KEY_A, async () => {
      events.push("a:start");
      return blocked.promise;
    });
    const bDone = queue.enqueue(KEY_B, async () => {
      events.push("b:start");
      return "b";
    });

    // One tile waiting on a slow document must not hold up any other tile's canvas.
    await expect(bDone).resolves.toBe("b");
    expect(events).toEqual(["a:start", "b:start"]);

    blocked.resolve("a");
    await expect(aDone).resolves.toBe("a");
  });

  it("preserves submission order across a longer queue", async () => {
    const queue = createRenderQueue<object>();
    const started: number[] = [];
    const gate = deferred<void>();

    const jobs = [1, 2, 3, 4, 5].map((n) =>
      queue.enqueue(KEY_A, async () => {
        started.push(n);
        await gate.promise;
        return n;
      }),
    );

    gate.resolve();
    await expect(Promise.all(jobs)).resolves.toEqual([1, 2, 3, 4, 5]);
    expect(started).toEqual([1, 2, 3, 4, 5]);
  });
});
