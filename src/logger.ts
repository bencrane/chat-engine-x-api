// src/logger.ts — Structured JSON logging
// Outputs JSON in production for log aggregation, pretty text in development.

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  requestId?: string;
  [key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const isProduction = process.env.NODE_ENV === "production";
const minLevel = isProduction ? LOG_LEVELS.info : LOG_LEVELS.debug;

function formatEntry(entry: LogEntry): string {
  if (isProduction) {
    return JSON.stringify(entry);
  }
  // Dev: human-readable format
  const { level, message, timestamp, requestId, ...extra } = entry;
  const reqPart = requestId ? ` [${requestId}]` : "";
  const extraPart = Object.keys(extra).length
    ? ` ${JSON.stringify(extra)}`
    : "";
  return `${timestamp} ${level.toUpperCase().padEnd(5)}${reqPart} ${message}${extraPart}`;
}

function log(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  if (LOG_LEVELS[level] < minLevel) return;

  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  };

  const output = formatEntry(entry);

  if (level === "error") {
    console.error(output);
  } else if (level === "warn") {
    console.warn(output);
  } else {
    console.log(output);
  }
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) =>
    log("debug", message, meta),
  info: (message: string, meta?: Record<string, unknown>) =>
    log("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) =>
    log("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) =>
    log("error", message, meta),
};
