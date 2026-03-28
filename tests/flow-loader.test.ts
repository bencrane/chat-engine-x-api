import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { getFlowConfig, initFlows, resetFlows } from "../src/flows/loader.js";

describe("flow loader", () => {
  beforeEach(() => {
    resetFlows();
  });

  it("loads and returns paidedge flow config", () => {
    initFlows();
    const flow = getFlowConfig("paidedge");
    expect(flow).not.toBeNull();
    expect(flow!.platform).toBe("paidedge");
    expect(flow!.capabilities).toEqual(["list-building", "paid-campaign"]);
    expect(flow!.systemPrompt).toContain("PaidEdge");
  });

  it("loads and returns outboundhq flow config", () => {
    initFlows();
    const flow = getFlowConfig("outboundhq");
    expect(flow).not.toBeNull();
    expect(flow!.platform).toBe("outboundhq");
    expect(flow!.capabilities).toEqual([
      "list-building",
      "campaign-orchestration",
    ]);
    expect(flow!.systemPrompt).toContain("OutboundHQ");
  });

  it("loads and returns paidautopsy flow config", () => {
    initFlows();
    const flow = getFlowConfig("paidautopsy");
    expect(flow).not.toBeNull();
    expect(flow!.platform).toBe("paidautopsy");
    expect(flow!.capabilities).toEqual(["list-building", "paid-campaign"]);
    expect(flow!.systemPrompt).toContain("PaidAutopsy");
  });

  it("returns null for unknown platform", () => {
    initFlows();
    const flow = getFlowConfig("unknown");
    expect(flow).toBeNull();
  });

  it("auto-initializes on first getFlowConfig call", () => {
    // Don't call initFlows() — getFlowConfig should do it
    const flow = getFlowConfig("paidedge");
    expect(flow).not.toBeNull();
    expect(flow!.platform).toBe("paidedge");
  });

  it("caches flows after initialization (idempotent)", () => {
    initFlows();
    const first = getFlowConfig("paidedge");
    initFlows(); // second call should be a no-op
    const second = getFlowConfig("paidedge");
    expect(first).toBe(second); // same reference
  });
});
