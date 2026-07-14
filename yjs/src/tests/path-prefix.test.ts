import { describe, expect, it } from 'vitest';
import { stripYjsPrefix } from '../server/path-prefix';

// The LB path route ('/yjs' matchPathBegin) forwards without stripping, so the
// server normalizes both origins to the same internal paths.
describe('stripYjsPrefix', () => {
  it('leaves legacy subdomain paths untouched', () => {
    expect(stripYjsPrefix('/health')).toBe('/health');
    expect(stripYjsPrefix('/entity-1?token=x&entityType=task')).toBe('/entity-1?token=x&entityType=task');
    expect(stripYjsPrefix('/')).toBe('/');
  });

  it('strips the /yjs prefix from path-routed requests, preserving the query', () => {
    expect(stripYjsPrefix('/yjs/health')).toBe('/health');
    expect(stripYjsPrefix('/yjs/health?depth=full')).toBe('/health?depth=full');
    expect(stripYjsPrefix('/yjs/entity-1?token=x&entityType=task')).toBe('/entity-1?token=x&entityType=task');
  });

  it('maps a bare /yjs to the root path', () => {
    expect(stripYjsPrefix('/yjs')).toBe('/');
  });

  it('does not false-strip lookalike prefixes or entity ids', () => {
    expect(stripYjsPrefix('/yjsfoo')).toBe('/yjsfoo');
    expect(stripYjsPrefix('/yjs-doc-1')).toBe('/yjs-doc-1');
  });
});
