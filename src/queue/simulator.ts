/**
 * In-memory waiting pool used for large-scale correctness tests.
 * Mirrors Durable Object semantics without Workers/DO overhead.
 *
 * Waiting visitors are kept in a deque for O(1) head promotion during drains.
 * Lottery Mode picks uniformly at random among current waiters.
 */
export interface SimConfig {
  maxConcurrentUsers: number;
  admitPerSecond: number;
  admissionMode?: "queue" | "lottery";
}

export interface SimVisitor {
  id: string;
  status: "waiting" | "admitted";
  sequence: number;
}

export class InMemoryQueue {
  private sequence = 1;
  private readonly visitors = new Map<string, SimVisitor>();
  private readonly waiting: string[] = [];
  private waitingHead = 0;
  private admittedCount = 0;
  private waitingCount = 0;
  private admitRemainder = 0;

  constructor(private readonly config: SimConfig) {}

  join(id: string): SimVisitor {
    const existing = this.visitors.get(id);
    if (existing && (existing.status === "waiting" || existing.status === "admitted")) {
      return existing;
    }

    if (this.admittedCount < this.config.maxConcurrentUsers) {
      const visitor: SimVisitor = { id, status: "admitted", sequence: this.sequence++ };
      this.visitors.set(id, visitor);
      this.admittedCount += 1;
      return visitor;
    }

    const visitor: SimVisitor = { id, status: "waiting", sequence: this.sequence++ };
    this.visitors.set(id, visitor);
    this.waiting.push(id);
    this.waitingCount += 1;
    return visitor;
  }

  leave(id: string): void {
    const visitor = this.visitors.get(id);
    if (!visitor) return;

    if (visitor.status === "admitted") {
      this.visitors.delete(id);
      this.admittedCount -= 1;
      this.fillSlots(1);
      return;
    }

    if (visitor.status === "waiting") {
      visitor.status = "admitted"; // mark removed from logical wait without compacting deque
      // Soft-delete: skip in peek/poll; keep counts accurate.
      this.visitors.delete(id);
      this.waitingCount -= 1;
    }
  }

  /** Advance admission budget by `seconds` (rate-limited path). */
  tick(seconds = 1): number {
    this.admitRemainder += this.config.admitPerSecond * seconds;
    const budget = Math.floor(this.admitRemainder);
    this.admitRemainder -= budget;
    return this.fillSlots(budget);
  }

  position(id: string): number | null {
    if (this.config.admissionMode === "lottery") {
      return null;
    }

    const visitor = this.visitors.get(id);
    if (!visitor || visitor.status !== "waiting") return null;

    let ahead = 0;
    for (let i = this.waitingHead; i < this.waiting.length; i += 1) {
      const otherId = this.waiting[i]!;
      if (otherId === id) {
        return ahead + 1;
      }
      const other = this.visitors.get(otherId);
      if (other?.status === "waiting") {
        ahead += 1;
      }
    }
    return null;
  }

  lotteryOdds(id: string): number | null {
    const visitor = this.visitors.get(id);
    if (!visitor || visitor.status !== "waiting" || this.config.admissionMode !== "lottery") {
      return null;
    }
    return this.waitingCount > 0 ? 1 / this.waitingCount : null;
  }

  count(status: "waiting" | "admitted"): number {
    return status === "waiting" ? this.waitingCount : this.admittedCount;
  }

  waitingIdsInOrder(): string[] {
    const ids: string[] = [];
    for (let i = this.waitingHead; i < this.waiting.length; i += 1) {
      const id = this.waiting[i]!;
      if (this.visitors.get(id)?.status === "waiting") {
        ids.push(id);
      }
    }
    return ids;
  }

  admittedIds(): string[] {
    const ids: string[] = [];
    for (const visitor of this.visitors.values()) {
      if (visitor.status === "admitted") {
        ids.push(visitor.id);
      }
    }
    return ids.sort((a, b) => this.visitors.get(a)!.sequence - this.visitors.get(b)!.sequence);
  }

  private fillSlots(limit: number): number {
    let admitted = 0;
    while (admitted < limit && this.admittedCount < this.config.maxConcurrentUsers) {
      const next = this.pollWaiting();
      if (!next) break;
      next.status = "admitted";
      this.admittedCount += 1;
      admitted += 1;
    }
    return admitted;
  }

  private pollWaiting(): SimVisitor | null {
    if (this.config.admissionMode === "lottery") {
      return this.pollWaitingLottery();
    }

    while (this.waitingHead < this.waiting.length) {
      const id = this.waiting[this.waitingHead]!;
      this.waitingHead += 1;
      const visitor = this.visitors.get(id);
      if (visitor?.status === "waiting") {
        this.waitingCount -= 1;
        // Compact occasionally to bound memory.
        if (this.waitingHead > 1024 && this.waitingHead * 2 > this.waiting.length) {
          this.waiting.splice(0, this.waitingHead);
          this.waitingHead = 0;
        }
        return visitor;
      }
    }
    return null;
  }

  private pollWaitingLottery(): SimVisitor | null {
    const candidates: SimVisitor[] = [];
    for (let i = this.waitingHead; i < this.waiting.length; i += 1) {
      const visitor = this.visitors.get(this.waiting[i]!);
      if (visitor?.status === "waiting") {
        candidates.push(visitor);
      }
    }
    if (candidates.length === 0) {
      return null;
    }
    const visitor = candidates[Math.floor(Math.random() * candidates.length)]!;
    this.waitingCount -= 1;
    return visitor;
  }
}
