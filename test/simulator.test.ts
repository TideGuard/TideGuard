import { describe, expect, it } from "vitest";
import { InMemoryQueue } from "../src/queue/simulator";

describe("InMemoryQueue", () => {
  it("admits until capacity then queues FIFO", () => {
    const queue = new InMemoryQueue({ maxConcurrentUsers: 2, admitPerSecond: 2 });
    expect(queue.join("a").status).toBe("admitted");
    expect(queue.join("b").status).toBe("admitted");
    expect(queue.join("c").status).toBe("waiting");
    expect(queue.join("d").status).toBe("waiting");
    expect(queue.position("c")).toBe(1);
    expect(queue.position("d")).toBe(2);
  });

  it("promotes waiters in order when seats free", () => {
    const queue = new InMemoryQueue({ maxConcurrentUsers: 1, admitPerSecond: 10 });
    queue.join("a");
    queue.join("b");
    queue.join("c");
    queue.leave("a");
    // leave() fills an open seat immediately (same as QueueRoom).
    expect(queue.position("b")).toBeNull();
    expect(queue.position("c")).toBe(1);
    expect(queue.count("admitted")).toBe(1);
    expect(queue.count("waiting")).toBe(1);
  });

  it("uses lottery odds instead of FIFO position", () => {
    const queue = new InMemoryQueue({
      maxConcurrentUsers: 1,
      admitPerSecond: 10,
      admissionMode: "lottery",
    });
    queue.join("seat");
    queue.join("early");
    queue.join("late");
    expect(queue.position("early")).toBeNull();
    expect(queue.lotteryOdds("early")).toBeCloseTo(0.5);
    expect(queue.lotteryOdds("late")).toBeCloseTo(0.5);

    const winners = new Set<string>();
    for (let i = 0; i < 40; i += 1) {
      const trial = new InMemoryQueue({
        maxConcurrentUsers: 1,
        admitPerSecond: 10,
        admissionMode: "lottery",
      });
      trial.join("seat");
      trial.join("early");
      trial.join("late");
      trial.leave("seat");
      winners.add(trial.admittedIds()[0]!);
    }
    expect(winners.has("early")).toBe(true);
    expect(winners.has("late")).toBe(true);
  });
});
