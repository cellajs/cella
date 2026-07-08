import { describe, expect, it } from 'vitest';
import { appConfig } from '../../../../../shared';
import { config } from '../../../../../shared/config/config.default';
import { parseOpenApiSpec } from '../parse-spec';
import type { OpenApiSpec, OpenApiTag } from '../types';

/**
 * Behavioural tests for the OpenAPI → docs parser.
 *
 * These replace the old full-spec snapshot: the OpenAPI *contract* is now
 * guarded in CI by oasdiff (`schema-bust-gate`), which watches the parser's
 * *input*. Here we assert the parser's *transformation* against small,
 * hand-owned fixtures, so a test only fails when parser behaviour changes —
 * never on ordinary API/schema churn.
 */

// Derive config-dependent expectations so the fixture survives config renames.
const ENTITY_TYPE = config.entityTypes[0]; // e.g. 'user'
const MODULE_TAG = `${ENTITY_TYPE}s`; // e.g. 'users'

describe('parseOpenApiSpec', () => {
  it('handles minimal spec', () => {
    const minimalSpec: OpenApiSpec = {
      openapi: '3.1.0',
      info: { title: 'Minimal API', version: '1.0.0' },
      paths: {},
    };

    const result = parseOpenApiSpec(minimalSpec);

    expect(result.operations).toEqual([]);
    expect(result.tags).toEqual([]);
    expect(result.schemas).toEqual([]);
    expect(result.info).toEqual({
      title: 'Minimal API',
      version: '1.0.0',
      description: '',
      openapiVersion: '3.1.0',
      extensions: [],
    });
  });

  it('extracts operation summaries correctly', () => {
    const spec: OpenApiSpec = {
      openapi: '3.1.0',
      info: { title: 'Test API', version: '1.0.0' },
      tags: [{ name: 'users', description: 'User operations' }],
      paths: {
        '/users': {
          get: {
            operationId: 'getUsers',
            summary: 'Get all users',
            tags: ['users'],
            responses: {
              '200': { description: 'Success' },
            },
          },
        },
      },
    };

    const result = parseOpenApiSpec(spec);

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]).toMatchObject({
      id: 'getUsers',
      method: 'get',
      path: '/users',
      tags: ['users'],
      summary: 'Get all users',
    });
    expect(result.tags).toHaveLength(1);
    expect(result.tags[0]).toMatchObject({
      name: 'users',
      description: 'User operations',
      count: 1,
    });
  });
});

/**
 * A single hand-owned fixture that deliberately exercises the parser's
 * interesting branches: excluded (non-module) tags, schema-kind buckets with
 * an `x-default` fallback, dynamic `x-extensions`, `$ref` response resolution
 * with example lifting, description stripping, and schema sort order.
 */
const goldenSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Golden API',
    version: '9.9.9',
    description: 'Hand-owned parser fixture',
    'x-extensions': [{ key: 'x-guard', id: 'xGuard', description: 'Route guards', kind: 'middleware' }],
  },
  tags: [
    { name: MODULE_TAG, description: 'User operations', kind: 'module' },
    { name: 'admin', kind: 'ownership' }, // excluded from operations + sidebar
    { name: 'data', kind: 'schema', description: 'Default schemas', 'x-default': true },
    { name: 'system', kind: 'schema', description: 'System schemas' },
  ] as OpenApiTag[],
  paths: {
    '/users': {
      get: {
        operationId: 'getUsers',
        summary: 'List users',
        tags: [MODULE_TAG, 'admin'],
        'x-guard': ['isAuthenticated'],
        parameters: [{ name: 'q', in: 'query', required: false, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'OK',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      // No x-tags → default ('data') bucket; description lifted to card, stripped from nested schema.
      Zebra: {
        type: 'object',
        description: 'A zebra',
        properties: { id: { type: 'string' } },
        required: ['id'],
        example: { id: 'z1' },
      },
      // Explicit x-tags matching a schema-kind tag → 'system' bucket.
      Alpha: { type: 'object', 'x-tags': ['system'], properties: { name: { type: 'string' } } },
      // Referenced by getUsers' 200 response; carries an example the parser lifts.
      User: {
        type: 'object',
        properties: { id: { type: 'string' }, email: { type: 'string', format: 'email' } },
        required: ['id'],
        example: { id: 'u1', email: 'a@b.com' },
      },
    },
  },
} as OpenApiSpec;

describe('parseOpenApiSpec — golden fixture', () => {
  const result = parseOpenApiSpec(goldenSpec);
  const getUsers = result.operations.find((o) => o.id === 'getUsers');

  it('strips excluded (non-module) tags from operations but keeps them grouped by kind', () => {
    expect(getUsers).toBeDefined();
    expect(getUsers?.tags).toEqual([MODULE_TAG]); // 'admin' (ownership kind) removed
    expect(getUsers?.tagsByKind).toEqual({ module: [MODULE_TAG], ownership: ['admin'] });
  });

  it('derives entityType from a module tag matching a configured entity type', () => {
    expect(getUsers?.entityType).toBe(ENTITY_TYPE);
  });

  it('produces a deterministic operation hash and capability flags', () => {
    expect(getUsers?.hash).toBe(`tag/${MODULE_TAG}/GET/users`);
    expect(getUsers).toMatchObject({
      hasParams: true,
      hasRequestBody: false,
      hasResponseBody: true,
      hasExample: true,
      deprecated: false,
    });
  });

  it('extracts x-extensions declared in info onto operations', () => {
    expect(result.info.extensions).toEqual([
      { key: 'x-guard', id: 'xGuard', description: 'Route guards', kind: 'middleware' },
    ]);
    expect(getUsers?.extensions).toEqual({ xGuard: ['isAuthenticated'] });
  });

  it('lists only module-kind tags in the sidebar with per-tag counts', () => {
    // 'admin' (ownership) and 'data'/'system' (schema) must not appear in the tag sidebar.
    expect(result.tags).toEqual([{ name: MODULE_TAG, description: 'User operations', count: 1, kind: 'module' }]);
  });

  it('buckets component schemas by x-tags with an x-default fallback', () => {
    const byName = Object.fromEntries(result.schemas.map((s) => [s.name, s]));
    expect(byName.Alpha.schemaTag).toBe('system'); // explicit x-tags
    expect(byName.Alpha.tagsByKind).toEqual({ schema: ['system'] });
    expect(byName.User.schemaTag).toBe('data'); // no x-tags → x-default bucket
    expect(byName.Zebra.schemaTag).toBe('data');
  });

  it('reports schema-kind tags with counts in registration order', () => {
    expect(result.schemaTags).toEqual([
      { name: 'data', description: 'Default schemas', count: 2 },
      { name: 'system', description: 'System schemas', count: 1 },
    ]);
  });

  it('sorts component schemas by ownership, then module, then name', () => {
    expect(result.schemas.map((s) => s.name)).toEqual(['Alpha', 'User', 'Zebra']);
  });

  it('lifts a schema description to the card and strips it from the nested schema', () => {
    const zebra = result.schemas.find((s) => s.name === 'Zebra');
    expect(zebra?.description).toBe('A zebra');
    expect(zebra?.schema.description).toBeUndefined();
    expect(zebra?.example).toEqual({ id: 'z1' });
  });

  it('resolves a $ref response, lifting the referenced component example and request params', () => {
    const detail = result.tagDetails.get(MODULE_TAG)?.[0];
    const ok = detail?.responses.find((r) => r.status === 200);
    expect(ok?.name).toBe('User');
    expect(ok?.ref).toBe('#/components/schemas/User');
    expect(ok?.contentType).toBe('application/json');
    expect(ok?.schema?.ref).toBe('#/components/schemas/User');
    expect(ok?.example).toEqual({ id: 'u1', email: 'a@b.com' });
    expect(detail?.request?.query?.properties?.q).toEqual({ type: 'string', required: false });
  });

  it('skips operations gated by a service disabled in this build', () => {
    const disabled = Object.entries(appConfig.services).find(([, service]) => service.enabled === false)?.[0];
    if (!disabled) return; // build has no disabled service; nothing to gate

    const spec = {
      openapi: '3.1.0',
      info: { title: 'Gated API', version: '1.0.0' },
      paths: {
        '/enabled': { get: { operationId: 'enabledOp', responses: { '200': { description: 'OK' } } } },
        '/gated': {
          get: { operationId: 'gatedOp', 'x-service': disabled, responses: { '200': { description: 'OK' } } },
        },
      },
    } as OpenApiSpec;

    const ids = parseOpenApiSpec(spec).operations.map((o) => o.id);
    expect(ids).toContain('enabledOp');
    expect(ids).not.toContain('gatedOp');
  });
});
