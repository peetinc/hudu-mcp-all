import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export type Config = {
  baseUrl: string;
  apiKey: string;
  disabledOperations: Set<string>;
  readonly: boolean;
  timeoutMs: number;
  maxRetries: number;
  maxResponseBytes: number;
  userAgentVersion: string;
  preset?: string;
  enableTags: string[];
  disableTags: string[];
};

function splitCsv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const DEFAULT_MAX_RESPONSE_BYTES = 1_500_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 30_000;

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function resolveApiKey(): string {
  const key = process.env.HUDU_API_KEY?.trim();
  if (!key) {
    throw new Error('HUDU_API_KEY is required. Set it in your MCP client env or .env file.');
  }
  return key;
}

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function loadConfig(): Config {
  loadEnvFile(resolve(process.cwd(), '.env'));

  const baseUrl = (process.env.HUDU_BASE_URL ?? '').trim().replace(/\/$/, '');
  if (!baseUrl) {
    throw new Error('HUDU_BASE_URL is required (e.g. https://yourorg.huducloud.com/api/v1)');
  }

  const apiKey = resolveApiKey();

  const disabledOperations = new Set(
    (process.env.HUDU_DISABLED_OPERATIONS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );

  const readonly = (process.env.HUDU_READONLY ?? 'false').toLowerCase() === 'true';

  return {
    baseUrl,
    apiKey,
    disabledOperations,
    readonly,
    timeoutMs: parseIntEnv('HUDU_TIMEOUT_MS', DEFAULT_TIMEOUT_MS),
    maxRetries: parseIntEnv('HUDU_MAX_RETRIES', DEFAULT_MAX_RETRIES),
    maxResponseBytes: parseIntEnv('HUDU_MAX_RESPONSE_BYTES', DEFAULT_MAX_RESPONSE_BYTES),
    userAgentVersion: '0.3.0',
    preset: process.env.HUDU_PRESET?.trim() || undefined,
    enableTags: splitCsv(process.env.HUDU_ENABLE_TAGS),
    disableTags: splitCsv(process.env.HUDU_DISABLE_TAGS),
  };
}
