import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import jwt from "jsonwebtoken";

const TEST_SECRET = "test-jwt-secret-key";

// Mock config before importing auth middleware
// Note: vi.mock is hoisted, so we inline the secret value
vi.mock("../src/config.js", () => ({
  config: {
    auth: { jwtSecret: "test-jwt-secret-key" },
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

import { authMiddleware, type ChatContext } from "../src/middleware/auth.js";

function createApp() {
  const app = new Hono<{
    Variables: { chatContext: ChatContext };
  }>();
  app.use("*", authMiddleware);
  app.get("/test", (c) => {
    const ctx = c.get("chatContext");
    return c.json(ctx);
  });
  return app;
}

function makeToken(
  payload: Record<string, unknown>,
  secret: string = TEST_SECRET
): string {
  return jwt.sign(payload, secret, { algorithm: "HS256" });
}

describe("auth middleware", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp();
  });

  it("returns 401 when Authorization header is missing", async () => {
    const res = await app.request("/test", {
      headers: {
        "X-Platform": "paidedge",
        "X-Org-Id": "org-1",
      },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/Authorization/i);
  });

  it("returns 401 when Authorization header does not start with Bearer", async () => {
    const res = await app.request("/test", {
      headers: {
        Authorization: "Basic abc123",
        "X-Platform": "paidedge",
        "X-Org-Id": "org-1",
      },
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 for an invalid JWT", async () => {
    const res = await app.request("/test", {
      headers: {
        Authorization: "Bearer invalid.token.here",
        "X-Platform": "paidedge",
        "X-Org-Id": "org-1",
      },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Invalid token");
  });

  it("returns 401 for a JWT signed with the wrong secret", async () => {
    const token = makeToken({ sub: "user-1" }, "wrong-secret");
    const res = await app.request("/test", {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Platform": "paidedge",
        "X-Org-Id": "org-1",
      },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Invalid token");
  });

  it("returns 400 when X-Platform header is missing", async () => {
    const token = makeToken({ sub: "user-1" });
    const res = await app.request("/test", {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Org-Id": "org-1",
      },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/X-Platform/);
  });

  it("returns 400 when X-Org-Id header is missing and no org_id in token", async () => {
    const token = makeToken({ sub: "user-1" });
    const res = await app.request("/test", {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Platform": "paidedge",
      },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/X-Org-Id/);
  });

  it("passes with valid JWT and required headers", async () => {
    const token = makeToken({ sub: "user-1", email: "user@test.com" });
    const res = await app.request("/test", {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Platform": "paidedge",
        "X-Org-Id": "org-1",
        "X-Client-Id": "client-1",
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      userId: "user-1",
      orgId: "org-1",
      clientId: "client-1",
      platform: "paidedge",
      email: "user@test.com",
    });
  });

  it("uses org_id from JWT claims when X-Org-Id header is absent", async () => {
    const token = makeToken({ sub: "user-1", org_id: "org-from-jwt" });
    const res = await app.request("/test", {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Platform": "outboundhq",
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.orgId).toBe("org-from-jwt");
  });

  it("sets clientId to null when X-Client-Id is absent", async () => {
    const token = makeToken({ sub: "user-1" });
    const res = await app.request("/test", {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Platform": "paidedge",
        "X-Org-Id": "org-1",
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clientId).toBeNull();
  });

  it("does not include email when not in JWT claims", async () => {
    const token = makeToken({ sub: "user-1" });
    const res = await app.request("/test", {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Platform": "paidedge",
        "X-Org-Id": "org-1",
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.email).toBeUndefined();
  });
});
