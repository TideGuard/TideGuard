import { env } from "cloudflare:workers";
import { runDurableObjectAlarm } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { DEFAULT_QUEUE_CONFIG } from "../../src/core/config";

/**
 * Durable Object load smoke test (opt-in).
 *
 *   RUN_DO_LOAD=1 LOAD_TEST_USERS=500 npm run test:load
 *
 * Keep DO load smaller than the in-memory suite: each join is a real RPC.
 * 100k DO joins is possible but slow and expensive on CPU time.
 */
const ENABLED = process.env.RUN_DO_LOAD === "1";
const USERS = Math.max(1, Number(process.env.LOAD_TEST_USERS ?? "200"));
const CAPACITY = Math.max(1, Number(process.env.LOAD_TEST_CAPACITY ?? "20"));

describe.runIf(ENABLED)(`QueueRoom DO load (${USERS} users)`, () => {
  it(
    "accepts many joins and preserves waiting FIFO head",
    async () => {
      const stub = env.QUEUE_ROOM.getByName(`load-${USERS}-${Date.now()}`);
      const config = {
        ...DEFAULT_QUEUE_CONFIG,
        maxConcurrentUsers: CAPACITY,
        admitPerSecond: 50,
      };

      const started = performance.now();
      for (let i = 0; i < USERS; i += 1) {
        await stub.join({
          queue: "load",
          config,
          visitorId: `u-${i}`,
        });
      }

      const metrics = await stub.metrics({ queue: "load", config });
      expect(metrics.admitted).toBe(Math.min(CAPACITY, USERS));
      expect(metrics.waiting).toBe(Math.max(0, USERS - CAPACITY));

      if (USERS > CAPACITY) {
        const head = await stub.status({
          queue: "load",
          config,
          visitorId: `u-${CAPACITY}`,
        });
        expect(head.ok).toBe(true);
        if (head.ok) {
          expect(head.visitor.position).toBe(1);
        }
      }

      await stub.setPaused(false);
      await runDurableObjectAlarm(stub);

      // eslint-disable-next-line no-console -- load-test timing signal
      console.log(
        JSON.stringify({
          mode: "durable-object",
          users: USERS,
          capacity: CAPACITY,
          elapsedMs: Math.round(performance.now() - started),
        }),
      );
    },
    Math.max(60_000, USERS * 20),
  );
});
