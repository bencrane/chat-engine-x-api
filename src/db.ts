// src/db.ts — Supabase client singleton
// Uses the service role key for backend access to provider_rules and config tables.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config.js";

let _client: SupabaseClient | null = null;

export function getDb(): SupabaseClient {
  if (!_client) {
    _client = createClient(config.supabase.url, config.supabase.serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return _client;
}

// Convenience alias
export const db: SupabaseClient = getDb();
