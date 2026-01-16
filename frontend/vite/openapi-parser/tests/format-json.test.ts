/**
 * Tests for the custom JSON formatter.
 * Verifies that formatJson produces valid, parseable JSON.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatJson } from '../format-json';
import { parseOpenApiSpec } from '../parse-spec';
import type { OpenApiSpec } from '../types';

const BACKEND_SPEC = resolve(__dirname, '../../../../backend/openapi.cache.json');

describe('formatJson', () => {
  it('produces valid JSON for primitive values', () => {
    const cases = [null, 'string', 123, true, false, 0, -1, ''];
    for (const value of cases) {
      const output = formatJson(value);
      expect(() => JSON.parse(output)).not.toThrow();
      expect(JSON.parse(output)).toEqual(value);
    }
  });

  it('produces valid JSON for arrays', () => {
    const cases = [
      [],
      ['a', 'b'],
      [1, 2, 3],
      [null, 'mixed', 42],
      [{ nested: true }],
      [
        [1, 2],
        [3, 4],
      ],
    ];
    for (const value of cases) {
      const output = formatJson(value);
      expect(() => JSON.parse(output)).not.toThrow();
      expect(JSON.parse(output)).toEqual(value);
    }
  });

  it('produces valid JSON for objects', () => {
    const cases = [
      {},
      { a: 1 },
      { type: 'string', required: true },
      { nested: { deep: { value: 1 } } },
      { mixed: [1, 2, { inner: 'value' }] },
    ];
    for (const value of cases) {
      const output = formatJson(value);
      expect(() => JSON.parse(output)).not.toThrow();
      expect(JSON.parse(output)).toEqual(value);
    }
  });

  it('collapses simple arrays to single line', () => {
    const output = formatJson({ tags: ['a', 'b', 'c'] });
    expect(output).toContain('["a", "b", "c"]');
    expect(output.split('\n').length).toBeLessThan(5);
  });

  it('collapses simple objects (≤2 keys) to single line', () => {
    const output = formatJson({ prop: { type: 'string', required: true } });
    expect(output).toContain('{ "type": "string", "required": true }');
  });

  it('does not collapse objects with >2 keys', () => {
    const output = formatJson({ a: 1, b: 2, c: 3 });
    expect(output.split('\n').length).toBeGreaterThan(1);
  });

  it('produces valid JSON for parsed OpenAPI spec', () => {
    const specJson = readFileSync(BACKEND_SPEC, 'utf-8');
    const spec = JSON.parse(specJson) as OpenApiSpec;
    const parsed = parseOpenApiSpec(spec);

    // Test each generated output type
    const outputs = [
      { name: 'operations', data: parsed.operations },
      { name: 'tags', data: parsed.tags },
      { name: 'info', data: parsed.info },
      { name: 'schemas', data: parsed.schemas },
      { name: 'schemaTags', data: parsed.schemaTags },
    ];

    for (const { name, data } of outputs) {
      const formatted = formatJson(data);
      expect(() => JSON.parse(formatted), `${name} should be valid JSON`).not.toThrow();
      expect(JSON.parse(formatted), `${name} should parse to equal value`).toEqual(data);
    }
  });
});
