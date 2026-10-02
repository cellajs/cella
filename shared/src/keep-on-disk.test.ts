import { describe, expect, it } from 'vitest';
import { keepOnDisk } from './keep-on-disk.ts';

describe('keepOnDisk', () => {
  it('keeps shared and listed packages external, subpaths included', () => {
    const { external } = keepOnDisk(['pg-logical-replication'], {});
    const isExternal = (name: string) => external.some((pattern) => pattern.test(name));

    for (const name of ['pg', 'pg/lib/client', '@opentelemetry/api', 'pino-pretty', 'jsdom', 'pg-logical-replication']) {
      expect(isExternal(name), name).toBe(true);
    }
    for (const name of ['pg-boss', 'hono', 'jsdom-extra']) expect(isExternal(name), name).toBe(false);
  });

  it('accepts dependencies the bundle loads from disk', () => {
    expect(() => keepOnDisk(['@napi-rs/canvas'], { pg: '^8', 'pino-pretty': '^13', '@napi-rs/canvas': '^0.1' })).not.toThrow();
  });

  it('rejects a dependency the bundle inlines, since the --prod image install would carry it unused', () => {
    expect(() => keepOnDisk([], { pg: '^8', jose: '^6', 'web-push': '^3' })).toThrow(/devDependencies.*jose, web-push/);
  });
});
