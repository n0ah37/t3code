import {
  NodeId,
  type OrchestrationV2ProviderTurn,
  ProviderThreadId,
  ProviderTurnId,
} from "@t3tools/contracts";
import { assert, describe, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";

import { upsertProviderTurn } from "./ProjectionStore.ts";

describe("provider turn token usage projection", () => {
  it("keeps live usage when a terminal update omits it", () => {
    const now = DateTime.makeUnsafe("2026-08-29T00:00:00.000Z");
    const running = {
      id: ProviderTurnId.make("provider-turn-usage"),
      providerThreadId: ProviderThreadId.make("provider-thread-usage"),
      nodeId: NodeId.make("node-usage"),
      runAttemptId: null,
      nativeTurnRef: null,
      ordinal: 1,
      status: "running",
      startedAt: now,
      completedAt: null,
      tokenUsage: {
        usedTokens: 50_000,
        maxTokens: 200_000,
        updatedAt: "2026-08-29T00:00:00.000Z",
      },
    } satisfies OrchestrationV2ProviderTurn;
    const completed = {
      ...running,
      status: "completed",
      completedAt: now,
      tokenUsage: undefined,
    } satisfies OrchestrationV2ProviderTurn;

    const projected = upsertProviderTurn([running], completed);

    assert.deepEqual(projected[0]?.tokenUsage, running.tokenUsage);
    assert.equal(projected[0]?.status, "completed");
  });

  it("keeps a turn's cost when a later update omits it", () => {
    const now = DateTime.makeUnsafe("2026-08-29T00:00:00.000Z");
    const completed = {
      id: ProviderTurnId.make("provider-turn-cost"),
      providerThreadId: ProviderThreadId.make("provider-thread-cost"),
      nodeId: NodeId.make("node-cost"),
      runAttemptId: null,
      nativeTurnRef: null,
      ordinal: 1,
      status: "completed",
      startedAt: now,
      completedAt: now,
      costUsd: 0.42,
    } satisfies OrchestrationV2ProviderTurn;
    const { costUsd: _costUsd, ...withoutCost } = completed;

    const projected = upsertProviderTurn([completed], withoutCost);

    assert.equal(projected[0]?.costUsd, 0.42);
  });
});
