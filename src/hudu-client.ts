import type { Config } from './config.js';
import type { ToolDef } from './types.js';

export type CallResult = {
  ok: boolean;
  status: number;
  body: unknown;
  contentType: string | null;
};

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
    fd.append(name, String(value));
  }
  return fd;
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

  const headers: Record<string, string> = {
    'x-api-key': config.apiKey,
    accept: 'application/json',
    'user-agent': 'hudu-mcp-all/0.1.0',
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

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), config.timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: tool.method,
      headers,
      body,
      signal: ac.signal,
    });
  } finally {
    clearTimeout(t);
  }

  const contentType = response.headers.get('content-type');
  let parsed: unknown;
  if (contentType && contentType.includes('application/json')) {
    parsed = await response.json().catch(() => null);
  } else {
    const text = await response.text();
    parsed = text;
  }

  return { ok: response.ok, status: response.status, body: parsed, contentType };
}
