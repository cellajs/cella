import { appConfig } from 'shared';
import { describe, expect, it } from 'vitest';
import { auditColumns, tombstoneColumns } from '#/db/utils/audit-columns';

const httpMethods = ['get', 'post', 'put', 'patch', 'delete'] as const;

/** String formats whose length is fixed by the format itself. */
const fixedLengthFormats = ['uuid', 'date-time', 'date', 'time', 'ipv4', 'ipv6'];

type SchemaNode = {
  $ref?: string;
  type?: string | string[];
  maxItems?: number;
  maxProperties?: number;
  maxLength?: number;
  format?: string;
  enum?: unknown[];
  const?: unknown;
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

  // A body that names a column the server owns reaches the row through a spread, so an update body built as
  // `createInsertSchema(table).partial()` without a pick would let a caller move a row to another tenant or forge a writer.
  // Fix: pick the fields a caller may send. Id columns stay open on POST bodies.
  it('must not let any request body name a server-only column', async () => {
    const { paths = {}, components } = await loadDocument();
    const schemas: Record<string, SchemaNode> = components?.schemas ?? {};
    const stamps = new Set([...Object.keys(auditColumns()), ...Object.keys(tombstoneColumns()), 'tenantId', 'seq']);
    // A POST names ids as the home of a create (the placement keys) or as a selector (a catch-up or a presigned-url read).
    const ids = new Set<string>(Object.values(appConfig.entityIdColumnKeys));

    const named = (node: SchemaNode | undefined, seen: string[]): string[] => {
      if (!node) return [];
      if (node.$ref) {
        const name = node.$ref.split('/').pop() ?? '';
        return seen.includes(name) ? [] : named(schemas[name], [...seen, name]);
      }
      const record = typeof node.additionalProperties === 'object' ? node.additionalProperties : undefined;
      return [
        ...Object.keys(node.properties ?? {}),
        ...named(node.items, seen),
        ...named(record, seen),
        ...Object.values(node.properties ?? {}).flatMap((child) => named(child, seen)),
        ...[...(node.allOf ?? []), ...(node.anyOf ?? []), ...(node.oneOf ?? [])].flatMap((child) => named(child, seen)),
      ];
    };

    const found = Object.values(paths).flatMap((item) =>
      httpMethods.flatMap((method) => {
        const operation = item[method];
        const body = operation?.requestBody;
        if (!operation || !body || '$ref' in body) return [];
        const keys = Object.values(body.content).flatMap((content) => named(content.schema, []));
        return [...new Set(keys)]
          .filter((key) => stamps.has(key) || (ids.has(key) && method !== 'post'))
          .map((key) => `${operation.operationId}: body property "${key}" is a server-only column, pick the fields a caller may send`);
      }),
    );
    expect(found).toEqual([]);
  });

  // A string without a cap costs whatever `jsonBodyLimit` allows, per field, in the parser, an index, a regex or a mail.
  // A `.max()` before any refinement refuses it first; a `maxLength` constant or the column's length names the cap.
  it('must not accept a string without a length limit', async () => {
    const { paths = {}, components } = await loadDocument();
    const schemas: Record<string, SchemaNode> = components?.schemas ?? {};

    const unbounded = (node: SchemaNode | undefined, at: string, seen: string[]): string[] => {
      if (!node) return [];
      if (node.$ref) {
        const name = node.$ref.split('/').pop() ?? '';
        return seen.includes(name) ? [] : unbounded(schemas[name], at, [...seen, name]);
      }
      const isString = node.type === 'string' || (Array.isArray(node.type) && node.type.includes('string'));
      const fixed = node.enum !== undefined || node.const !== undefined || fixedLengthFormats.includes(node.format ?? '');
      const record = typeof node.additionalProperties === 'object' ? node.additionalProperties : undefined;
      return [
        ...(isString && node.maxLength === undefined && !fixed ? [at] : []),
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
