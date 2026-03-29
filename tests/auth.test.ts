import { describe, it, expect, beforeEach, vi } from "vitest";
import { Hono } from "hono";
import {
  generateKeyPair,
  exportJWK,
  SignJWT,
  createLocalJWKSet,
  type KeyLike,
} from "jose";

// Shared ref for test keypair — populated by the hoisted mock factory
const keyRef = vi.hoisted(() => ({
  privateKey: null as KeyLike | null,
}));

// vi.mock is hoisted; the async factory generates the keypair and returns a
// patched jose where createRemoteJWKSet resolves to a local JWKS.
vi.mock("jose", async (importOriginal) => {
  const actual = await importOriginal<typeof import("jose")>();
  const keyPair = await actual.generateKeyPair("EdDSA");
  keyRef.privateKey = keyPair.privateKey;

  const jwk = await actual.exportJWK(keyPair.publicKey);
  jwk.kid = "test-key-1";
  jwk.alg = "EdDSA";
  jwk.use = "sig";

  const localJWKS = actual.createLocalJWKSet({ keys: [jwk] });

  return {
    ...actual,
    createRemoteJWKSet: () => localJWKS,
  };
});

// Set env vars before importing the middleware (reads them at module scope)
process.env.AUTH_JWKS_URL = "https://api.authengine.dev/api/auth/jwks";
process.env.AUTH_ISSUER = "https://api.authengine.dev";
process.env.AUTH_AUDIENCE = "https://api.authengine.dev";

const { authMiddleware } = await import("../src/middleware/auth.js");
type AuthContext = import("../src/middleware/auth.js").AuthContext;

function createApp() {
  const app = new Hono<{
    Variables: { auth: AuthContext };
  }>();
  app.use("*", authMiddleware);
  app.get("/test", (c) => {
    const auth = c.get("auth");
    return c.json(auth);
  });
  return app;
}

async function makeToken(
  claims: Record<string, unknown>,
  options?: { key?: KeyLike; expiresIn?: string }
): Promise<string> {
  const key = options?.key ?? keyRef.privateKey!;
  let builder = new SignJWT(claims)
    .setProtectedHeader({ alg: "EdDSA", kid: "test-key-1" })
    .setIssuer("https://api.authengine.dev")
    .setAudience("https://api.authengine.dev")
    .setIssuedAt();

  if (options?.expiresIn) {
    builder = builder.setExpirationTime(options.expiresIn);
  } else {
    builder = builder.setExpirationTime("1h");
  }

  return builder.sign(key);
}

describe("auth middleware", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp();
  });

  it("returns 401 when Authorization header is missing", async () => {
    const res = await app.request("/test");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
    expect(body.message).toMatch(/Missing or invalid authentication token/);
  });

  it("returns 401 when Authorization header does not start with Bearer", async () => {
    const res = await app.request("/test", {
      headers: { Authorization: "Basic abc123" },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
  });

  it("returns 401 for an invalid JWT", async () => {
    const res = await app.request("/test", {
      headers: { Authorization: "Bearer invalid.token.here" },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.message).toMatch(/Invalid or malformed token/);
  });

  it("returns 401 for a JWT signed with the wrong key", async () => {
    const wrongKeyPair = await generateKeyPair("EdDSA");
    const token = await makeToken(
      { sub: "user-1", org_id: "org-1", role: "admin", type: "session" },
      { key: wrongKeyPair.privateKey }
    );
    const res = await app.request("/test", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 when sub claim is missing", async () => {
    const token = await makeToken({ org_id: "org-1", role: "admin", type: "session" });
    const res = await app.request("/test", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.message).toMatch(/sub/);
  });

  it("returns 401 when org_id claim is missing", async () => {
    const token = await makeToken({ sub: "user-1", role: "admin", type: "session" });
    const res = await app.request("/test", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.message).toMatch(/org_id/);
  });

  it("returns 401 when role claim is missing", async () => {
    const token = await makeToken({ sub: "user-1", org_id: "org-1", type: "session" });
    const res = await app.request("/test", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.message).toMatch(/role/);
  });

  it("returns 401 for unsupported token type", async () => {
    const token = await makeToken({
      sub: "user-1",
      org_id: "org-1",
      role: "admin",
      type: "refresh",
    });
    const res = await app.request("/test", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.message).toMatch(/Unsupported token type/);
  });

  it("passes with valid session token", async () => {
    const token = await makeToken({
      sub: "user-1",
      org_id: "org-1",
      role: "admin",
      type: "session",
    });
    const res = await app.request("/test", {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Client-Id": "client-1",
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      userId: "user-1",
      orgId: "org-1",
      role: "admin",
      tokenType: "session",
      clientId: "client-1",
    });
  });

  it("passes with valid m2m token", async () => {
    const token = await makeToken({
      sub: "service-1",
      org_id: "org-1",
      role: "service",
      type: "m2m",
    });
    const res = await app.request("/test", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tokenType).toBe("m2m");
  });

  it("sets clientId to null when X-Client-Id is absent", async () => {
    const token = await makeToken({
      sub: "user-1",
      org_id: "org-1",
      role: "admin",
      type: "session",
    });
    const res = await app.request("/test", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clientId).toBeNull();
  });

  it("ignores X-Org-Id header — org comes from JWT only", async () => {
    const token = await makeToken({
      sub: "user-1",
      org_id: "org-A",
      role: "admin",
      type: "session",
    });
    const res = await app.request("/test", {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Org-Id": "org-B",
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.orgId).toBe("org-A");
  });

  it("returns expired message for expired tokens", async () => {
    const token = await makeToken(
      { sub: "user-1", org_id: "org-1", role: "admin", type: "session" },
      { expiresIn: "-1s" }
    );
    const res = await app.request("/test", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.message).toMatch(/expired/i);
  });
});
