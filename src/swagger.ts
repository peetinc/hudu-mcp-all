import type { SwaggerOperation, SwaggerParam, SwaggerSchema, SwaggerSpec, ToolDef } from './types.js';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

const UPDATED_AT_HINT =
  "Hudu date-range filter. Accepts ISO 8601. Range syntax: 'start_datetime,end_datetime' (comma-separated). Open-ended: 'start,' or ',end'. Single timestamp = exact match.";

const CREATED_AT_HINT = UPDATED_AT_HINT;

const CUSTOM_FIELDS_HINT =
  "Hudu custom fields use an unusual array-of-singleton-objects shape. Each item is an object with ONE key (the field label in snake_case) and its value. Example: " +
  "[{\"operating_system\":\"macOS 15\"}, {\"is_active\":\"true\"}, {\"office_location\":{\"address_line_1\":\"123 Main\",\"city\":\"Denver\",\"state\":\"CO\",\"zip\":\"80202\",\"country_name\":\"USA\"}}]. " +
  "Text=string. Date=YYYY/MM/DD. Checkbox='true'/'false'. Number=string. Asset tag=array of asset IDs. List select=array of item names. Address=object with address_line_1, city, state, zip, country_name.";

const ASSET_BODY_HINT =
  "Body must include name and asset_layout_id. custom_fields uses Hudu's array-of-singleton-objects shape (see custom_fields docs in this same schema).";

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

function enhanceParamSchema(name: string, schema: SwaggerSchema, isFile: boolean): SwaggerSchema {
  const out: SwaggerSchema = { ...schema };
  if (name === 'updated_at') {
    out.description = [out.description, UPDATED_AT_HINT].filter(Boolean).join(' — ');
  } else if (name === 'created_at') {
    out.description = [out.description, CREATED_AT_HINT].filter(Boolean).join(' — ');
  }
  if (isFile) {
    out.description = [
      out.description,
      "File source. Accepts: absolute path (/Users/.../img.png), ~-relative path (~/Downloads/x.png), file:// URL, or 'base64:[mime|filename;]<base64data>' inline blob (mime+filename optional).",
    ]
      .filter(Boolean)
      .join(' — ');
  }
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

function injectBodyHints(operationId: string, schema: SwaggerSchema): SwaggerSchema {
  const out: SwaggerSchema = { ...schema };
  const assetOps = new Set([
    'post_companies_company_id_assets',
    'put_companies_company_id_assets_id',
  ]);
  if (assetOps.has(operationId)) {
    out.description = [out.description, ASSET_BODY_HINT].filter(Boolean).join(' — ');
    if (out.properties?.custom_fields) {
      out.properties = {
        ...out.properties,
        custom_fields: {
          ...out.properties.custom_fields,
          description: CUSTOM_FIELDS_HINT,
        },
      };
    }
  }
  return out;
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
        properties[p.name] = enhanceParamSchema(p.name, paramToJsonSchema(p), false);
        if (p.required) required.push(p.name);
      }

      const operationId = op.operationId ?? deriveToolName(undefined, method, pathTemplate);

      if (bodyParam) {
        const schema = bodyParam.schema ?? { type: 'object' };
        properties.body = injectBodyHints(operationId, {
          ...schema,
          description: bodyParam.description ?? `Request body (${bodyParam.name})`,
        });
        if (bodyParam.required) required.push('body');
      }

      for (const p of formDataParams) {
        const isFile = p.type === 'file';
        properties[p.name] = enhanceParamSchema(p.name, paramToJsonSchema(p), isFile);
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
        tags: op.tags ?? [],
      });
    }
  }

  if (!tools.some((t) => t.name === 'hudu_test_connection')) {
    tools.push({
      name: 'hudu_test_connection',
      description:
        "Test connection and credentials against the configured Hudu instance. Alias of get_api_info. Returns instance version + date on success. — GET /api_info",
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      method: 'GET',
      pathTemplate: '/api_info',
      pathParams: [],
      queryParams: [],
      bodyParam: undefined,
      formDataParams: [],
      consumesMultipart: false,
      tags: ['API Info'],
      synthetic: true,
    });
  }

  return tools;
}
