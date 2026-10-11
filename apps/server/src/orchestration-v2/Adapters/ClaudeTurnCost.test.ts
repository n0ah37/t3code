import { describe, expect, it } from "vite-plus/test";

import { claudeTurnCostUsd } from "./ClaudeAdapterV2.ts";

describe("claudeTurnCostUsd", () => {
  it("charges a turn the growth of its process's running cost", () => {
    expect(claudeTurnCostUsd(0, 0.3)).toBeCloseTo(0.3);
    expect(claudeTurnCostUsd(0.3, 0.75)).toBeCloseTo(0.45);
  });

  it("charges a resumed process only its own growth once seeded with the session's total", () => {
    // Claude carries a resumed session's earlier cost into the new process's total.
    expect(claudeTurnCostUsd(10.2, 12.75)).toBeCloseTo(2.55);
  });

  it("treats a smaller total as a count restarted by /clear", () => {
    expect(claudeTurnCostUsd(0.75, 0.1)).toBeCloseTo(0.1);
  });

  it("ignores missing and zeroed totals", () => {
    expect(claudeTurnCostUsd(0.3, undefined)).toBeUndefined();
    expect(claudeTurnCostUsd(0.3, 0)).toBeUndefined();
    expect(claudeTurnCostUsd(0.3, Number.NaN)).toBeUndefined();
    expect(claudeTurnCostUsd(0.3, 0.3)).toBeUndefined();
  });
});
