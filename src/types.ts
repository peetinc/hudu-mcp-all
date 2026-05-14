export type SwaggerParam = {
  name: string;
  in: 'path' | 'query' | 'body' | 'formData' | 'header';
  type?: string;
  required?: boolean;
  description?: string;
  schema?: SwaggerSchema;
  format?: string;
  enum?: string[];
  items?: SwaggerSchema;
};

export type SwaggerSchema = {
  type?: string;
  properties?: Record<string, SwaggerSchema>;
  required?: string[];
  items?: SwaggerSchema;
  enum?: string[];
  description?: string;
  format?: string;
  $ref?: string;
};

export type SwaggerOperation = {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: SwaggerParam[];
  consumes?: string[];
  produces?: string[];
  responses?: Record<string, unknown>;
};

export type SwaggerSpec = {
  swagger?: string;
  basePath?: string;
  host?: string;
  paths: Record<string, Record<string, SwaggerOperation>>;
  definitions?: Record<string, SwaggerSchema>;
};

export type ToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  method: string;
  pathTemplate: string;
  pathParams: string[];
  queryParams: string[];
  bodyParam?: string;
  formDataParams: string[];
  consumesMultipart: boolean;
};
