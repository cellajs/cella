import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseOpenApiSpec } from '../parse-spec';
import type { OpenApiSpec } from '../types';

// Prefer the committed SDK spec (always present on a clean checkout);
// fall back to the gitignored backend cache (present after `pnpm sdk`).
const PUBLIC_SPEC = resolve(__dirname, '../../../../gen/openapi.json');
const CACHE_SPEC = resolve(__dirname, '../../../../../backend/openapi.cache.json');
const BACKEND_SPEC = existsSync(PUBLIC_SPEC) ? PUBLIC_SPEC : CACHE_SPEC;

/**
 * Helper to convert Map to object for snapshot comparison.
 * Maps don't serialize well in snapshots.
 */
function mapToObject<K extends string, V>(map: Map<K, V>): Record<K, V> {
  const obj = {} as Record<K, V>;
  for (const [key, value] of map.entries()) {
    obj[key] = value;
  }
  return obj;
}

/** Hash input spec to detect changes without huge diffs */
function hashSpec(spec: OpenApiSpec): string {
  return createHash('sha256').update(JSON.stringify(spec)).digest('hex').slice(0, 16);
}

// Snapshot test: compares parser output against saved snapshots to catch regressions.
describe('parseOpenApiSpec', () => {
  it('parses backend spec correctly', () => {
    const specJson = readFileSync(BACKEND_SPEC, 'utf-8');
    const spec = JSON.parse(specJson) as OpenApiSpec;

    const result = parseOpenApiSpec(spec);

    // Convert tagDetails Map to object for snapshot
    const snapshotResult = {
      ...result,
      tagDetails: mapToObject(result.tagDetails),
    };

    // Use hash for input to detect spec changes without huge diffs
    // - Input hash changed + output changed = spec update (run: pnpm test:update)
    // - Input hash same + output changed = parser bug
    expect({ inputHash: hashSpec(spec), output: snapshotResult }).toMatchSnapshot();
  });

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
