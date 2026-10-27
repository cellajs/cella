import { describe, expect, it } from 'vitest';
import { bakeDefinition, parseBuildRows } from './build-images';

describe('bakeDefinition', () => {
  it('builds each image from its own stage: a stage lost on the way builds every image of the file as its last stage', () => {
    const rows = parseBuildRows(
      JSON.stringify([
        { service: 'backend', dockerfile: 'Dockerfile', target: 'backend' },
        { service: 'yjs', dockerfile: 'Dockerfile', target: 'yjs' },
        { service: 'frontend', dockerfile: 'infra/caddy/Dockerfile', target: '' },
      ]),
    );
    const { target } = bakeDefinition(rows, {
      registry: 'rg.nl-ams.scw.cloud',
      namespace: 'app',
      releaseSha: 'abc',
      epoch: 'e1',
      nodeVersion: '26.12.0',
      context: '/build',
    });
    expect((target.backend as { target?: string }).target).toBe('backend');
    expect((target.yjs as { target?: string }).target).toBe('yjs');
    expect(target.frontend).not.toHaveProperty('target');
    expect((target['boot-runner'] as { context: string }).context).toBe('/build/infra/boot');
  });

  it('builds every image, the boot runner included, on the Node the root engines.node pins', () => {
    const rows = parseBuildRows(JSON.stringify([{ service: 'backend', dockerfile: 'Dockerfile', target: 'backend' }]));
    const { target } = bakeDefinition(rows, { registry: 'rg', namespace: 'app', releaseSha: 'abc', epoch: 'e1', nodeVersion: '26.12.0' });
    expect(target.backend).toMatchObject({ args: { RELEASE_SHA: 'abc', NODE_VERSION: '26.12.0' } });
    expect(target['boot-runner']).toMatchObject({ args: { NODE_VERSION: '26.12.0' } });
  });

  it("bakes the services before the boot image, and caches each image's layers under the builder's tag", () => {
    const rows = parseBuildRows(JSON.stringify([{ service: 'backend', dockerfile: 'Dockerfile', target: 'backend' }]));
    const bake = bakeDefinition(rows, {
      registry: 'rg',
      namespace: 'app',
      releaseSha: 'abc',
      epoch: 'e1',
      nodeVersion: '26.12.0',
      cacheTag: 'buildcache-r3',
    });
    expect(bake.group).toMatchObject({ services: { targets: ['backend'] }, boot: { targets: ['boot-runner'] } });
    expect(bake.target.backend).toMatchObject({
      'cache-from': ['type=registry,ref=rg/app/backend:buildcache-r3'],
      'cache-to': ['type=registry,ref=rg/app/backend:buildcache-r3,mode=max'],
    });
    expect(
      bakeDefinition(rows, { registry: 'rg', namespace: 'app', releaseSha: 'abc', epoch: 'e1', nodeVersion: '26.12.0' }).target.backend,
    ).not.toHaveProperty('cache-from');
  });
});
