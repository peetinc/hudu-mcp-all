import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename } from 'node:path';
import type { Config } from './config.js';
import type { ToolDef } from './types.js';

export type CallResult = {
  ok: boolean;
  status: number;
  body: unknown;
  contentType: string | null;
  truncated?: boolean;
  originalBytes?: number;
  retries?: number;
  binary?: { encoding: 'base64'; data: string; bytes: number };
};

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.zip': 'application/zip',
};

function guessMime(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot < 0) return 'application/octet-stream';
  return MIME_BY_EXT[filename.slice(dot).toLowerCase()] ?? 'application/octet-stream';
}

function expandPath(p: string): string {
  if (p.startsWith('~')) return p.replace(/^~/, homedir());
  if (p.startsWith('file://')) return p.slice(7);
  return p;
}

type FileSource =
  | { kind: 'path'; path: string }
  | { kind: 'base64'; mime: string; filename: string; data: string }
  | null;

function parseFileSource(value: unknown): FileSource {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();

  if (trimmed.startsWith('base64:')) {
    const rest = trimmed.slice(7);
    const sepIdx = rest.indexOf(';');
    if (sepIdx > 0) {
      const meta = rest.slice(0, sepIdx);
      const data = rest.slice(sepIdx + 1);
      const [mime = 'application/octet-stream', filename = 'upload.bin'] = meta.split('|');
      return { kind: 'base64', mime, filename, data };
    }
    return { kind: 'base64', mime: 'application/octet-stream', filename: 'upload.bin', data: rest };
  }

  if (
    trimmed.startsWith('/') ||
    trimmed.startsWith('~') ||
    trimmed.startsWith('file://') ||
    trimmed.startsWith('./')
  ) {
    const expanded = expandPath(trimmed);
    if (existsSync(expanded)) return { kind: 'path', path: expanded };
  }

  return null;
}

function fillPath(template: string, args: Record<string, unknown>, pathParams: string[]): string {
  let url = template;
  for (const name of pathParams) {
    const value = args[name];
    if (value === undefined || value === null || value === '') {
      throw new Error(`Missing required path parameter: ${name}`);
    }
    url = url.replace(`{${name}}`, encodeURIComponent(String(value)));
  }
  return url;
}

function buildQuery(args: Record<string, unknown>, queryParams: string[]): string {
  const sp = new URLSearchParams();
  for (const name of queryParams) {
    const value = args[name];
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const v of value) sp.append(name, String(v));
    } else {
      sp.append(name, String(value));
    }
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

function buildMultipart(args: Record<string, unknown>, formDataParams: string[]): FormData {
  const fd = new FormData();
  for (const name of formDataParams) {
    const value = args[name];
    if (value === undefined || value === null) continue;

    const source = parseFileSource(value);
    if (source && source.kind === 'path') {
      const buf = readFileSync(source.path);
      const filename = basename(source.path);
      const mime = guessMime(filename);
      fd.append(
        name,
        new Blob([buf], { type: mime }) as unknown as Blob,
        filename
      );
      continue;
    }
    if (source && source.kind === 'base64') {
      const buf = Buffer.from(source.data, 'base64');
      fd.append(
        name,
        new Blob([buf], { type: source.mime }) as unknown as Blob,
        source.filename
      );
      continue;
    }

    fd.append(name, String(value));
  }
  return fd;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseRetryAfter(header: string | null): number {
  if (!header) return 0;
  const asInt = Number.parseInt(header, 10);
  if (Number.isFinite(asInt) && asInt >= 0) return asInt * 1000;
  const asDate = Date.parse(header);
  if (Number.isFinite(asDate)) {
    const delta = asDate - Date.now();
    return delta > 0 ? delta : 0;
  }
  return 0;
}

function maybeTruncate(
  body: unknown,
  contentType: string | null,
  limit: number
): { body: unknown; truncated: boolean; originalBytes: number } {
  let serialized: string;
  if (typeof body === 'string') {
    serialized = body;
  } else {
    try {
      serialized = JSON.stringify(body);
    } catch {
      return { body, truncated: false, originalBytes: 0 };
    }
  }
  const bytes = Buffer.byteLength(serialized, 'utf8');
  if (bytes <= limit) return { body, truncated: false, originalBytes: bytes };

  const head = serialized.slice(0, Math.max(0, limit - 200));
  return {
    body: {
      __truncated: true,
      __original_bytes: bytes,
      __limit_bytes: limit,
      __content_type: contentType,
      preview: head,
    },
    truncated: true,
    originalBytes: bytes,
  };
}

export async function callTool(
  tool: ToolDef,
  rawArgs: unknown,
  config: Config
): Promise<CallResult> {
  if (config.disabledOperations.has(tool.name)) {
    throw new Error(`Operation '${tool.name}' is disabled via HUDU_DISABLED_OPERATIONS`);
  }
  if (config.readonly && tool.method === 'DELETE') {
    throw new Error(`Operation '${tool.name}' blocked: HUDU_READONLY=true forbids DELETE`);
  }

  const args = (rawArgs ?? {}) as Record<string, unknown>;

  const path = fillPath(tool.pathTemplate, args, tool.pathParams);
  const query = buildQuery(args, tool.queryParams);
  const url = `${config.baseUrl}${path}${query}`;

  const wantsDownload = args.download === true || args.download === 'true';

  const headers: Record<string, string> = {
    'x-api-key': config.apiKey,
    accept: wantsDownload ? '*/*' : 'application/json',
    'user-agent': `hudu-mcp-all/${config.userAgentVersion}`,
  };

  let body: BodyInit | undefined;

  if (tool.bodyParam && args.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(args.body);
  } else if (tool.formDataParams.length > 0 && tool.consumesMultipart) {
    body = buildMultipart(args, tool.formDataParams);
  } else if (tool.formDataParams.length > 0) {
    const sp = new URLSearchParams();
    for (const name of tool.formDataParams) {
      const v = args[name];
      if (v !== undefined && v !== null) sp.append(name, String(v));
    }
    headers['content-type'] = 'application/x-www-form-urlencoded';
    body = sp.toString();
  }

  let response: Response | null = null;
  let retries = 0;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), config.timeoutMs);
    try {
      response = await fetch(url, {
        method: tool.method,
        headers,
        body,
        redirect: wantsDownload ? 'manual' : 'follow',
        signal: ac.signal,
      });
    } finally {
      clearTimeout(t);
    }

    if (response.status !== 429) break;
    if (attempt === config.maxRetries) break;

    retries++;
    const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
    const backoffMs = retryAfterMs || Math.min(1000 * 2 ** attempt, 15000);
    await sleep(backoffMs);
  }

  if (!response) throw new Error('No response received');

  const contentType = response.headers.get('content-type');
  const status = response.status;

  if (wantsDownload && status >= 300 && status < 400) {
    const location = response.headers.get('location');
    return {
      ok: true,
      status,
      contentType,
      body: { redirect: location, note: 'Cloud-storage redirect — fetch the URL directly for the file.' },
      retries,
    };
  }

  if (wantsDownload && response.ok) {
    const ab = await response.arrayBuffer();
    const buf = Buffer.from(ab);
    return {
      ok: true,
      status,
      contentType,
      body: {
        note: 'Binary download. Decode `binary.data` (base64) to recover the file.',
        bytes: buf.byteLength,
      },
      binary: { encoding: 'base64', data: buf.toString('base64'), bytes: buf.byteLength },
      retries,
    };
  }

  let parsed: unknown;
  if (contentType && contentType.includes('application/json')) {
    parsed = await response.json().catch(() => null);
  } else if (contentType && (contentType.startsWith('text/') || contentType.includes('xml'))) {
    parsed = await response.text();
  } else if (!response.ok) {
    parsed = await response.text();
  } else {
    const ab = await response.arrayBuffer();
    const buf = Buffer.from(ab);
    return {
      ok: response.ok,
      status,
      contentType,
      body: { note: 'Binary response. Use `download=true` query param if available.', bytes: buf.byteLength },
      binary: { encoding: 'base64', data: buf.toString('base64'), bytes: buf.byteLength },
      retries,
    };
  }

  const { body: maybeTrunc, truncated, originalBytes } = maybeTruncate(
    parsed,
    contentType,
    config.maxResponseBytes
  );

  return {
    ok: response.ok,
    status,
    body: maybeTrunc,
    contentType,
    truncated,
    originalBytes,
    retries,
  };
}
