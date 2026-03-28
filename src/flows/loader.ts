// src/flows/loader.ts — Platform flow loader
// Reads and caches flow .md files at startup. Each file defines capabilities and a system prompt.

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "../logger.js";

export interface FlowConfig {
  platform: string;
  capabilities: string[];
  systemPrompt: string;
}

// Resolve flows directory relative to this file.
// Works in both dev (src/flows/) and production (dist/flows/).
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FLOWS_DIR = __dirname;

// In-memory cache, populated once on first call to initFlows()
const flowCache = new Map<string, FlowConfig>();
let initialized = false;

/**
 * Parse a flow .md file with YAML-like frontmatter.
 * Expected format:
 * ---
 * platform: name
 * capabilities:
 *   - cap1
 *   - cap2
 * ---
 * System prompt text...
 */
function parseFlowFile(content: string): FlowConfig | null {
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!fmMatch) return null;

  const frontmatter = fmMatch[1];
  const systemPrompt = fmMatch[2].trim();

  // Parse platform
  const platformMatch = frontmatter.match(/^platform:\s*(.+)$/m);
  if (!platformMatch) return null;
  const platform = platformMatch[1].trim();

  // Parse capabilities list
  const capabilities: string[] = [];
  const capSection = frontmatter.match(
    /capabilities:\s*\n((?:\s+-\s+.+\n?)*)/
  );
  if (capSection) {
    const lines = capSection[1].split("\n");
    for (const line of lines) {
      const match = line.match(/^\s+-\s+(.+)$/);
      if (match) capabilities.push(match[1].trim());
    }
  }

  return { platform, capabilities, systemPrompt };
}

/**
 * Load all .md flow files from the flows directory into the cache.
 * Call once at startup.
 */
export function initFlows(): void {
  if (initialized) return;

  const files = readdirSync(FLOWS_DIR).filter((f) => f.endsWith(".md"));

  for (const file of files) {
    try {
      const content = readFileSync(join(FLOWS_DIR, file), "utf-8");
      const flow = parseFlowFile(content);
      if (flow) {
        flowCache.set(flow.platform, flow);
        logger.info(`Loaded flow: ${flow.platform}`, {
          capabilities: flow.capabilities,
        });
      } else {
        logger.warn(`Failed to parse flow file: ${file}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Error reading flow file: ${file}`, { error: message });
    }
  }

  initialized = true;
  logger.info(`Flow loader initialized`, { flows: flowCache.size });
}

/**
 * Get the flow config for a given platform name.
 * Returns null if no flow is defined for the platform.
 */
export function getFlowConfig(platform: string): FlowConfig | null {
  if (!initialized) initFlows();
  return flowCache.get(platform) || null;
}

/**
 * Reset the flow cache (used in testing).
 */
export function resetFlows(): void {
  flowCache.clear();
  initialized = false;
}
