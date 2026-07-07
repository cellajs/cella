import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { config } from '../../../../../shared/config/config.default';
import { generateOperationHash } from '../../openapi-parser/file-generators';
import { buildOperationDocsUrl } from '../plugin';

// Docs URL format must match the frontend operations route: reads `operationTag`
// and resolves the anchor via generateOperationHash. Guards against emitting
// unresolvable api.cellajs.com/docs#... links.
describe('buildOperationDocsUrl', () => {
  it('builds a frontend docs link with the operationTag param and hash anchor', () => {
    const url = buildOperationDocsUrl('post', '/auth/check-email', 'auth');
    expect(url).toBe(`${config.frontendUrl}/docs/operations?operationTag=auth#tag/auth/POST/auth/check-email`);
  });

  it('points at the frontend URL, not the backend/api URL', () => {
    const url = buildOperationDocsUrl('get', '/auth/health', 'auth');
    expect(url.startsWith(`${config.frontendUrl}/docs/operations`)).toBe(true);
    expect(url).not.toContain(`${config.backendUrl}/docs`);
    expect(url).not.toContain('/docs#tag');
  });

  it('uses the same anchor format as the docs route (generateOperationHash)', () => {
    const method = 'get';
    const path = '/auth/health';
    const tag = 'auth';
    const url = buildOperationDocsUrl(method, path, tag);
    const fragment = url.split('#')[1];
    expect(fragment).toBe(generateOperationHash(method, path, [tag]));
  });
});

// Prefer the committed SDK output (always present on a clean checkout).
const GENERATED_SDK = resolve(__dirname, '../../../../gen/sdk.gen.ts');

describe('generated sdk.gen.ts docs links', () => {
  it('contains no legacy api.cellajs.com/docs# links', () => {
    if (!existsSync(GENERATED_SDK)) return;
    const source = readFileSync(GENERATED_SDK, 'utf-8');
    expect(source).not.toMatch(/\/docs#tag\//);
    expect(source).not.toContain(`${config.backendUrl}/docs`);
  });

  it('emits docs links in the expected frontend format', () => {
    if (!existsSync(GENERATED_SDK)) return;
    const source = readFileSync(GENERATED_SDK, 'utf-8');
    const links = source.match(/https?:\/\/[^)\s]*\/docs\/operations\?operationTag=[^)\s]+/g) ?? [];
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toMatch(
        new RegExp(`^${escapeRegExp(config.frontendUrl)}/docs/operations\\?operationTag=[^#]+#tag/[^/]+/[A-Z]+/`),
      );
    }
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
