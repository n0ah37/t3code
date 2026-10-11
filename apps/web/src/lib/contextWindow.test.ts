import { describe, expect, it } from "vite-plus/test";
import * as DateTime from "effect/DateTime";
import {
  deriveLatestContextWindowSnapshot,
  formatContextWindowTokens,
  latestProviderTurnTokenUsage,
  withThreadCost,
} from "./contextWindow";

describe("V2 context window presentation", () => {
  it("uses retained compaction token data when available", () => {
    const snapshot = deriveLatestContextWindowSnapshot([
      {
        item: {
          id: "compaction-1" as never,
          threadId: "thread-1" as never,
          runId: null,
          nodeId: null,
          providerThreadId: null,
          providerTurnId: null,
          nativeItemRef: null,
          parentItemId: null,
          ordinal: 1,
          status: "completed",
          title: null,
          startedAt: null,
          completedAt: null,
          updatedAt: DateTime.makeUnsafe("2026-06-20T00:00:00.000Z"),
          type: "compaction",
          driver: null,
          beforeTokenCount: 10_000,
          afterTokenCount: 2_000,
        },
      },
    ]);
    expect(snapshot?.usedTokens).toBe(2_000);
    expect(snapshot?.totalProcessedTokens).toBe(10_000);
  });

  it("prefers current provider usage and preserves ACP cost", () => {
    const snapshot = deriveLatestContextWindowSnapshot([], undefined, {
      contextUsage: {
        usedTokens: 2_500,
        maxTokens: 10_000,
        cost: { amount: 0.42, currency: "USD" },
      },
      updatedAt: DateTime.makeUnsafe("2026-08-23T00:00:00.000Z"),
    });

    expect(snapshot).toMatchObject({
      usedTokens: 2_500,
      maxTokens: 10_000,
      remainingTokens: 7_500,
      usedPercentage: 25,
      cost: { amount: 0.42, currency: "USD" },
    });
  });

  it("formats compact token values", () => {
    expect(formatContextWindowTokens(1_500)).toBe("1.5k");
  });
});

describe("live provider-turn usage (#8144)", () => {
  it("prefers the provider's live report over compaction items", () => {
    const snapshot = deriveLatestContextWindowSnapshot([], {
      usedTokens: 42_000,
      maxTokens: 200_000,
      inputTokens: 40_000,
      outputTokens: 2_000,
      updatedAt: "2026-08-27T00:00:00.000Z",
    });
    expect(snapshot).not.toBeNull();
    expect(snapshot?.usedTokens).toBe(42_000);
    expect(snapshot?.maxTokens).toBe(200_000);
    expect(snapshot?.remainingTokens).toBe(158_000);
    expect(snapshot?.usedPercentage).toBe(21);
  });

  it("ends the prompt cache one lifetime after the last report", () => {
    const snapshot = deriveLatestContextWindowSnapshot([], {
      usedTokens: 42_000,
      promptCacheTtlMs: 60 * 60_000,
      updatedAt: "2026-08-27T00:00:00.000Z",
    });
    expect(snapshot?.promptCacheExpiresAtMs).toBe(Date.parse("2026-08-27T01:00:00.000Z"));
    const unknown = deriveLatestContextWindowSnapshot([], {
      usedTokens: 42_000,
      updatedAt: "2026-08-27T00:00:00.000Z",
    });
    expect(unknown?.promptCacheExpiresAtMs).toBeUndefined();
  });

  it("handles a report without a known context window", () => {
    const snapshot = deriveLatestContextWindowSnapshot([], {
      usedTokens: 42_000,
      updatedAt: "2026-08-27T00:00:00.000Z",
    });
    expect(snapshot?.maxTokens).toBeNull();
    expect(snapshot?.usedPercentage).toBeNull();
  });
});

describe("latestProviderTurnTokenUsage", () => {
  it("picks the newest report, not the last turn in snapshot order", () => {
    const usage = (usedTokens: number, updatedAt: string) => ({
      tokenUsage: { usedTokens, updatedAt },
    });
    // Snapshots sort by provider thread id, so an older thread can come last.
    const latest = latestProviderTurnTokenUsage([
      usage(300_000, "2026-06-20T12:00:00.000Z"),
      {},
      usage(90_000, "2026-06-20T09:00:00.000Z"),
    ]);
    expect(latest?.usedTokens).toBe(300_000);
  });
});

describe("withThreadCost", () => {
  const snapshot = deriveLatestContextWindowSnapshot([], {
    usedTokens: 42_000,
    updatedAt: "2026-08-27T00:00:00.000Z",
  });
  const completedAt = DateTime.makeUnsafe("2026-08-27T00:00:00.000Z");

  it("adds up the cost of every turn the provider priced", () => {
    const priced = withThreadCost(snapshot, [
      { costUsd: 0.25, completedAt },
      { completedAt: null },
      { costUsd: 0.5, completedAt },
    ]);
    expect(priced?.cost).toEqual({ amount: 0.75, currency: "USD" });
    expect(priced?.unpricedTurnCount).toBeUndefined();
  });

  it("counts finished turns with no price, so a partial sum is not the whole session", () => {
    const mixed = withThreadCost(snapshot, [
      { completedAt },
      { completedAt },
      { costUsd: 0.5, completedAt },
    ]);
    expect(mixed?.cost).toEqual({ amount: 0.5, currency: "USD" });
    expect(mixed?.unpricedTurnCount).toBe(2);

    const unpriced = withThreadCost(snapshot, [{ completedAt }]);
    expect(unpriced?.cost).toBeNull();
    expect(unpriced?.unpricedTurnCount).toBe(1);
  });

  it("says nothing about cost before any turn finishes", () => {
    expect(withThreadCost(snapshot, [{ completedAt: null }])).toEqual(snapshot);
  });
});
