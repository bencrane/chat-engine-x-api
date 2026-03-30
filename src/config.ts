// src/config.ts — Centralized configuration module
// Loads and validates environment variables at startup, failing fast on missing required values.

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, defaultValue = ""): string {
  return process.env[name] || defaultValue;
}

function buildConfig() {
  return Object.freeze({
    port: parseInt(optional("PORT", "8080"), 10),
    nodeEnv: optional("NODE_ENV", "development"),

    anthropic: Object.freeze({
      apiKey: required("ANTHROPIC_API_KEY"),
      chatModel: optional("CHAT_MODEL", "claude-sonnet-4-20250514"),
    }),

    supabase: Object.freeze({
      url: required("SUPABASE_URL"),
      serviceKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    }),

    services: Object.freeze({
      dataEngineX: Object.freeze({
        url: optional("DATA_ENGINE_X_URL"),
        token: optional("DATA_ENGINE_X_TOKEN"),
      }),
      creativeEngineX: Object.freeze({
        url: optional("CREATIVE_ENGINE_X_URL"),
        token: optional("CREATIVE_ENGINE_X_TOKEN"),
      }),
      outboundEngineX: Object.freeze({
        url: optional("OUTBOUND_ENGINE_X_URL"),
        token: optional("OUTBOUND_ENGINE_X_TOKEN"),
      }),
      paidEngineX: Object.freeze({
        url: optional("PAID_ENGINE_X_URL"),
        token: optional("PAID_ENGINE_X_TOKEN"),
      }),
    }),

    auth: Object.freeze({
      jwksUrl: required("AUTH_JWKS_URL"),
      issuer: required("AUTH_ISSUER"),
      audience: required("AUTH_AUDIENCE"),
    }),

    cors: Object.freeze({
      allowedOrigins: optional("ALLOWED_ORIGINS", "").split(",").filter(Boolean),
    }),
  });
}

export type Config = ReturnType<typeof buildConfig>;

// Singleton — built once on first import
export const config: Config = buildConfig();
