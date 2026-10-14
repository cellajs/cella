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
    const { target } = bakeDefinition(rows, { registry: 'rg.nl-ams.scw.cloud', namespace: 'app', tag: 'abc', context: '/build' });
    expect((target.backend as { target?: string }).target).toBe('backend');
    expect((target.yjs as { target?: string }).target).toBe('yjs');
    expect(target.frontend).not.toHaveProperty('target');
    expect((target['boot-runner'] as { context: string }).context).toBe('/build/infra/boot');
  });
});
