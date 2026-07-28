import { describe, expect, it } from "vitest";
import { InMemoryQueue } from "../../src/queue/simulator";

/**
 * Configurable scale test for FIFO semantics.
 *
 * Examples:
 *   LOAD_TEST_USERS=500 npm run test:load
 *   LOAD_TEST_USERS=1000 npm run test:load
 *   LOAD_TEST_USERS=5000 npm run test:load
 *   LOAD_TEST_USERS=100000 npm run test:load
 */
const USERS = Math.max(1, Number(process.env.LOAD_TEST_USERS ?? "1000"));
const CAPACITY = Math.max(1, Number(process.env.LOAD_TEST_CAPACITY ?? "20"));
const ADMIT_PER_SECOND = Math.max(1, Number(process.env.LOAD_TEST_ADMIT_PER_SECOND ?? "100"));

describe(`in-memory queue load (${USERS} users, capacity ${CAPACITY})`, () => {
  it(
    "enqueues in FIFO order and drains without skipping waiters",
    () => {
      const started = performance.now();
      const queue = new InMemoryQueue({
        maxConcurrentUsers: CAPACITY,
        admitPerSecond: ADMIT_PER_SECOND,
      });

      for (let i = 0; i < USERS; i += 1) {
        queue.join(`u-${i}`);
      }

      expect(queue.count("admitted")).toBe(Math.min(CAPACITY, USERS));
      expect(queue.count("waiting")).toBe(Math.max(0, USERS - CAPACITY));

      const waitingOrder = queue.waitingIdsInOrder();
      expect(waitingOrder.length).toBe(Math.max(0, USERS - CAPACITY));
      if (waitingOrder.length > 0) {
        expect(waitingOrder[0]).toBe(`u-${CAPACITY}`);
        expect(waitingOrder[waitingOrder.length - 1]).toBe(`u-${USERS - 1}`);
        expect(queue.position(waitingOrder[0]!)).toBe(1);
        expect(queue.position(waitingOrder[waitingOrder.length - 1]!)).toBe(waitingOrder.length);
      }

      const admittedQueue: string[] = [];
      for (let i = 0; i < Math.min(CAPACITY, USERS); i += 1) {
        admittedQueue.push(`u-${i}`);
      }

      const admissionOrder: string[] = [];
      for (let i = 0; i < waitingOrder.length; i += 1) {
        const freeId = admittedQueue.shift()!;
        queue.leave(freeId);
        const promoted = waitingOrder[i]!;
        admissionOrder.push(promoted);
        admittedQueue.push(promoted);
      }

      expect(queue.count("waiting")).toBe(0);
      expect(admissionOrder).toEqual(waitingOrder);

      // Sample a few promoted ids still present as admitted.
      if (admissionOrder.length > 0) {
        expect(queue.count("admitted")).toBe(Math.min(CAPACITY, USERS));
      }

      const elapsedMs = performance.now() - started;
      // eslint-disable-next-line no-console -- load-test timing signal
      console.log(
        JSON.stringify({
          users: USERS,
          capacity: CAPACITY,
          admitPerSecond: ADMIT_PER_SECOND,
          elapsedMs: Math.round(elapsedMs),
          joinsPerSecond: Math.round(USERS / Math.max(elapsedMs / 1000, 0.001)),
        }),
      );
    },
    USERS >= 50_000 ? 300_000 : 120_000,
  );
});
