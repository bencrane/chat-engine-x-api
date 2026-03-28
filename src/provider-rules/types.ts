// src/provider-rules/types.ts — Provider rule types

export interface ProviderRule {
  id: string;
  orgId: string;
  clientId: string | null;
  dataNeed: string;
  provider: string;
  priority: number;
  config: Record<string, unknown> | null;
}
