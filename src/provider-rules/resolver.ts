// src/provider-rules/resolver.ts — Three-tier provider rule resolution
// Queries Supabase provider_rules table with fallback: org+client → org default → empty.

import { db } from "../db.js";
import { logger } from "../logger.js";
import type { ProviderRule } from "./types.js";

/**
 * Map a Supabase row to our ProviderRule interface.
 */
function toProviderRule(row: Record<string, unknown>): ProviderRule {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    clientId: (row.client_id as string) || null,
    dataNeed: row.data_need as string,
    provider: row.provider as string,
    priority: row.priority as number,
    config: (row.config as Record<string, unknown>) || null,
  };
}

/**
 * Resolve provider rules using three-tier fallback:
 * 1. Org + client specific rules (client_id = clientId)
 * 2. Org default rules (client_id IS NULL)
 * 3. Empty array (DEX uses global defaults)
 *
 * Results are sorted by priority ascending (lower number = higher priority).
 */
export async function resolveProviderRules(
  orgId: string,
  clientId: string | null,
  dataNeed: string
): Promise<ProviderRule[]> {
  // Tier 1: Try org + client specific rules
  if (clientId) {
    const { data, error } = await db
      .from("provider_rules")
      .select("*")
      .eq("org_id", orgId)
      .eq("client_id", clientId)
      .eq("data_need", dataNeed)
      .order("priority", { ascending: true });

    if (error) {
      logger.error("Failed to query provider_rules (tier 1)", {
        error: error.message,
        orgId,
        clientId,
        dataNeed,
      });
    } else if (data && data.length > 0) {
      return data.map(toProviderRule);
    }
  }

  // Tier 2: Org default rules (client_id IS NULL)
  const { data, error } = await db
    .from("provider_rules")
    .select("*")
    .eq("org_id", orgId)
    .is("client_id", null)
    .eq("data_need", dataNeed)
    .order("priority", { ascending: true });

  if (error) {
    logger.error("Failed to query provider_rules (tier 2)", {
      error: error.message,
      orgId,
      dataNeed,
    });
    return [];
  }

  if (data && data.length > 0) {
    return data.map(toProviderRule);
  }

  // Tier 3: No rules found — DEX will use its own defaults
  return [];
}

/**
 * Convert resolved rules into the provider_filters format that DEX expects.
 * Groups rules by data_need, listing providers in priority order.
 */
export function toProviderFilters(
  rules: ProviderRule[]
): Record<string, unknown> {
  const filters: Record<string, { providers: { name: string; config: Record<string, unknown> | null }[] }> = {};

  for (const rule of rules) {
    if (!filters[rule.dataNeed]) {
      filters[rule.dataNeed] = { providers: [] };
    }
    filters[rule.dataNeed].providers.push({
      name: rule.provider,
      config: rule.config,
    });
  }

  return filters;
}
