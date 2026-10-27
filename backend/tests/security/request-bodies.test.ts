import { describe, expect, it } from 'vitest';

const httpMethods = ['get', 'post', 'put', 'patch', 'delete'] as const;

type SchemaNode = {
  $ref?: string;
  type?: string | string[];
  maxItems?: number;
  maxProperties?: number;
  items?: SchemaNode;
  properties?: Record<string, SchemaNode>;
  additionalProperties?: boolean | SchemaNode;
  allOf?: SchemaNode[];
  anyOf?: SchemaNode[];
  oneOf?: SchemaNode[];
};

const loadDocument = async () => {
  const { baseApp } = await import('#/routes');
  return baseApp.getOpenAPI31Document({ openapi: '3.1.0', info: { title: 'bodies', version: '0' } });
};

/**
 * A request body that is not required skips validation when the request carries no Content-Type, and the handler then
 * reads an empty object. So every operation that takes a body requires it, and a bodiless request answers 400. The
 * table is the API itself, read from the app's own OpenAPI document.
 */
describe('request bodies', () => {
  it('must not accept a bodiless request on an operation that takes a body', async () => {
    const { paths = {} } = await loadDocument();

    const optional = Object.values(paths).flatMap((item) =>
      httpMethods.flatMap((method) => {
        const operation = item[method];
        const body = operation?.requestBody;
        return body && !('$ref' in body) && !body.required ? [String(operation.operationId)] : [];
      }),
    );
    expect(optional).toEqual([]);
  });

  // Zod adds an issue for every element or value that fails, so one body near the size limit costs hundreds of
  // megabytes. A `.max()` before any refinement, or `boundedRecord`, refuses it with one issue before the elements parse.
  it('must not accept an array or a record without a size limit', async () => {
    const { paths = {}, components } = await loadDocument();
    const schemas: Record<string, SchemaNode> = components?.schemas ?? {};

    const unbounded = (node: SchemaNode | undefined, at: string, seen: string[]): string[] => {
      if (!node) return [];
      if (node.$ref) {
        const name = node.$ref.split('/').pop() ?? '';
        return seen.includes(name) ? [] : unbounded(schemas[name], at, [...seen, name]);
      }
      const isArray = node.type === 'array' || (Array.isArray(node.type) && node.type.includes('array'));
      const record = typeof node.additionalProperties === 'object' ? node.additionalProperties : undefined;
      return [
        ...(isArray && node.maxItems === undefined ? [at] : []),
        ...(record && node.maxProperties === undefined ? [at] : []),
        ...unbounded(node.items, `${at}[]`, seen),
        ...unbounded(record, `${at}.*`, seen),
        ...Object.entries(node.properties ?? {}).flatMap(([key, child]) => unbounded(child, `${at}.${key}`, seen)),
        ...[...(node.allOf ?? []), ...(node.anyOf ?? []), ...(node.oneOf ?? [])].flatMap((child) => unbounded(child, at, seen)),
      ];
    };

    const found = Object.values(paths).flatMap((item) =>
      httpMethods.flatMap((method) => {
        const operation = item[method];
        if (!operation) return [];
        const parameters = (operation.parameters ?? []).flatMap((parameter) =>
          '$ref' in parameter ? [] : unbounded(parameter.schema, `${operation.operationId} ${parameter.in}.${parameter.name}`, []),
        );
        const body = operation.requestBody;
        const media = body && !('$ref' in body) ? Object.values(body.content) : [];
        return [...parameters, ...media.flatMap((content) => unbounded(content.schema, `${operation.operationId} body`, []))];
      }),
    );
    expect([...new Set(found)]).toEqual([]);
  });
});
