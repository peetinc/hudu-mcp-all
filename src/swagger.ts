import type { SwaggerOperation, SwaggerParam, SwaggerSchema, SwaggerSpec, ToolDef } from './types.js';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

function swaggerTypeToJsonSchema(type: string | undefined): string {
  switch (type) {
    case 'integer':
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'file':
      return 'string';
    default:
      return 'string';
  }
}

function paramToJsonSchema(p: SwaggerParam): SwaggerSchema {
  if (p.schema) return p.schema;
  const out: SwaggerSchema = {
    type: swaggerTypeToJsonSchema(p.type),
    description: p.description,
  };
  if (p.enum) out.enum = p.enum;
  if (p.type === 'array' && p.items) out.items = p.items;
  return out;
}

function deriveToolName(operationId: string | undefined, method: string, path: string): string {
  if (operationId && operationId.trim()) return operationId.replace(/[^A-Za-z0-9_-]/g, '_');
  const cleanedPath = path
    .replace(/^\//, '')
    .replace(/\{([^}]+)\}/g, '$1')
    .replace(/\//g, '_');
  return `${method}_${cleanedPath}`;
}

export function buildTools(spec: SwaggerSpec): ToolDef[] {
  const tools: ToolDef[] = [];

  for (const [pathTemplate, methods] of Object.entries(spec.paths)) {
    for (const method of HTTP_METHODS) {
      const op = (methods as Record<string, SwaggerOperation>)[method];
      if (!op) continue;

      const params = op.parameters ?? [];
      const pathParams = params.filter((p) => p.in === 'path');
      const queryParams = params.filter((p) => p.in === 'query');
      const bodyParam = params.find((p) => p.in === 'body');
      const formDataParams = params.filter((p) => p.in === 'formData');

      const properties: Record<string, SwaggerSchema> = {};
      const required: string[] = [];

      for (const p of [...pathParams, ...queryParams]) {
        properties[p.name] = paramToJsonSchema(p);
        if (p.required) required.push(p.name);
      }

      if (bodyParam) {
        const schema = bodyParam.schema ?? { type: 'object' };
        properties.body = {
          ...schema,
          description: bodyParam.description ?? `Request body (${bodyParam.name})`,
        };
        if (bodyParam.required) required.push('body');
      }

      for (const p of formDataParams) {
        properties[p.name] = paramToJsonSchema(p);
        if (p.required) required.push(p.name);
      }

      const consumesMultipart = (op.consumes ?? []).some((c) => c.includes('multipart'));

      const description = [
        op.summary,
        op.description,
        op.tags?.length ? `Tag: ${op.tags.join(', ')}` : undefined,
        `${method.toUpperCase()} ${pathTemplate}`,
      ]
        .filter(Boolean)
        .join(' — ');

      const inputSchema: Record<string, unknown> = {
        type: 'object',
        properties,
        ...(required.length ? { required } : {}),
        additionalProperties: false,
      };

      tools.push({
        name: deriveToolName(op.operationId, method, pathTemplate),
        description,
        inputSchema,
        method: method.toUpperCase(),
        pathTemplate,
        pathParams: pathParams.map((p) => p.name),
        queryParams: queryParams.map((p) => p.name),
        bodyParam: bodyParam ? 'body' : undefined,
        formDataParams: formDataParams.map((p) => p.name),
        consumesMultipart,
      });
    }
  }

  return tools;
}
