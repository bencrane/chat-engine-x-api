import { describe, it, expect, vi, beforeEach } from "vitest";

// Build a chainable mock that captures the query and returns configured data
function createChainMock() {
  const queries: { method: string; args: unknown[] }[] = [];
  let resultFn: (query: typeof queries) => { data: unknown[] | null; error: { message: string } | null };

  const chain: Record<string, (...args: unknown[]) => typeof chain> & {
    _setResult: (fn: typeof resultFn) => void;
  } = {
    _setResult(fn) {
      resultFn = fn;
    },
  } as any;

  for (const method of ["select", "eq", "is", "order"]) {
    (chain as any)[method] = (...args: unknown[]) => {
      queries.push({ method, args });
      if (method === "order") {
        // Terminal — return the result
        return resultFn(queries);
      }
      return chain;
    };
  }

  return {
    chain,
    getQueries: () => queries,
    reset: () => {
      queries.length = 0;
    },
  };
}

let queryResults: { data: unknown[] | null; error: { message: string } | null }[] = [];
let callIndex = 0;

const mockFrom = vi.fn().mockImplementation(() => {
  const mock = createChainMock();
  mock.chain._setResult(() => {
    const result = queryResults[callIndex] || { data: [], error: null };
    callIndex++;
    return result;
  });
  return mock.chain;
});

vi.mock("../src/db.js", () => ({
  db: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

vi.mock("../src/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  resolveProviderRules,
  toProviderFilters,
} from "../src/provider-rules/resolver.js";
import type { ProviderRule } from "../src/provider-rules/types.js";

function makeRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: "rule-1",
    org_id: "org-1",
    client_id: null,
    data_need: "contact-enrichment",
    provider: "clearbit",
    priority: 1,
    config: null,
    ...overrides,
  };
}

describe("resolveProviderRules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryResults = [];
    callIndex = 0;
  });

  it("returns org+client specific rules (tier 1) when they exist", async () => {
    queryResults = [
      { data: [makeRow({ client_id: "client-1", provider: "zoominfo", priority: 1 })], error: null },
    ];

    const rules = await resolveProviderRules("org-1", "client-1", "contact-enrichment");
    expect(rules).toHaveLength(1);
    expect(rules[0].provider).toBe("zoominfo");
    expect(rules[0].clientId).toBe("client-1");
    expect(rules[0].orgId).toBe("org-1");
  });

  it("falls back to org defaults (tier 2) when no client-specific rules exist", async () => {
    queryResults = [
      { data: [], error: null }, // tier 1 empty
      { data: [makeRow({ provider: "clearbit", priority: 1 })], error: null }, // tier 2
    ];

    const rules = await resolveProviderRules("org-1", "client-1", "contact-enrichment");
    expect(rules).toHaveLength(1);
    expect(rules[0].provider).toBe("clearbit");
    expect(rules[0].clientId).toBeNull();
  });

  it("returns empty array (tier 3) when no rules exist at any level", async () => {
    queryResults = [
      { data: [], error: null }, // tier 1 empty
      { data: [], error: null }, // tier 2 empty
    ];

    const rules = await resolveProviderRules("org-1", "client-1", "contact-enrichment");
    expect(rules).toHaveLength(0);
  });

  it("skips tier 1 when clientId is null and goes straight to tier 2", async () => {
    queryResults = [
      { data: [makeRow({ provider: "apollo", priority: 2 })], error: null },
    ];

    const rules = await resolveProviderRules("org-1", null, "contact-enrichment");
    expect(rules).toHaveLength(1);
    expect(rules[0].provider).toBe("apollo");

    // from() should only be called once (tier 2 directly)
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it("returns rules sorted by priority ascending", async () => {
    const rows = [
      makeRow({ id: "r1", provider: "clearbit", priority: 1 }),
      makeRow({ id: "r2", provider: "apollo", priority: 2 }),
      makeRow({ id: "r3", provider: "zoominfo", priority: 3 }),
    ];
    queryResults = [{ data: rows, error: null }];

    const rules = await resolveProviderRules("org-1", null, "contact-enrichment");
    expect(rules.map((r) => r.priority)).toEqual([1, 2, 3]);
    expect(rules.map((r) => r.provider)).toEqual(["clearbit", "apollo", "zoominfo"]);
  });

  it("returns empty array on database error", async () => {
    queryResults = [{ data: null, error: { message: "connection refused" } }];

    const rules = await resolveProviderRules("org-1", null, "contact-enrichment");
    expect(rules).toHaveLength(0);
  });
});

describe("toProviderFilters", () => {
  it("converts rules to provider_filters format", () => {
    const rules: ProviderRule[] = [
      {
        id: "r1",
        orgId: "org-1",
        clientId: null,
        dataNeed: "contact-enrichment",
        provider: "clearbit",
        priority: 1,
        config: { api_tier: "premium" },
      },
      {
        id: "r2",
        orgId: "org-1",
        clientId: null,
        dataNeed: "contact-enrichment",
        provider: "apollo",
        priority: 2,
        config: null,
      },
      {
        id: "r3",
        orgId: "org-1",
        clientId: null,
        dataNeed: "firmographic",
        provider: "zoominfo",
        priority: 1,
        config: null,
      },
    ];

    const filters = toProviderFilters(rules);
    expect(filters).toEqual({
      "contact-enrichment": {
        providers: [
          { name: "clearbit", config: { api_tier: "premium" } },
          { name: "apollo", config: null },
        ],
      },
      firmographic: {
        providers: [{ name: "zoominfo", config: null }],
      },
    });
  });

  it("returns empty object for empty rules array", () => {
    const filters = toProviderFilters([]);
    expect(filters).toEqual({});
  });
});
