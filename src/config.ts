import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

export type Config = {
  baseUrl: string;
  apiKey: string;
  disabledOperations: Set<string>;
  readonly: boolean;
  timeoutMs: number;
};

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
  if (process.env.HUDU_API_KEY && process.env.HUDU_API_KEY.trim()) {
    return process.env.HUDU_API_KEY.trim();
  }
  const explicitFile = process.env.HUDU_API_KEY_FILE;
  if (explicitFile) {
    const expanded = explicitFile.replace(/^~/, homedir());
    if (existsSync(expanded)) return readFileSync(expanded, 'utf8').trim();
  }
  const defaultFile = resolve(homedir(), '.hudukey');
  if (existsSync(defaultFile)) return readFileSync(defaultFile, 'utf8').trim();
  throw new Error(
    'No Hudu API key found. Set HUDU_API_KEY, HUDU_API_KEY_FILE, or create ~/.hudukey'
  );
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
  const timeoutMs = Number.parseInt(process.env.HUDU_TIMEOUT_MS ?? '30000', 10);

  return { baseUrl, apiKey, disabledOperations, readonly, timeoutMs };
}
