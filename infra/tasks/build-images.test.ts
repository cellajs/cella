import { describe, expect, it } from 'vitest';
import { rootNodeVersion } from '../lib/deploy/main-job';
import { bakeDefinition, parseBuildRows } from './build-images';

const nodeVersion = rootNodeVersion();
const base = { registry: 'rg.nl-ams.scw.cloud', namespace: 'app', releaseSha: 'abc', nodeVersion, archiveDir: '/run/images' };

describe('bakeDefinition', () => {
  it('builds each image from its own stage: a stage lost on the way builds every image of the file as its last stage', () => {
    const rows = parseBuildRows(
      JSON.stringify([
        { service: 'backend', dockerfile: 'Dockerfile', target: 'backend' },
        { service: 'yjs', dockerfile: 'Dockerfile', target: 'yjs' },
        { service: 'frontend', dockerfile: 'infra/caddy/Dockerfile', target: '' },
      ]),
    );
    const { target } = bakeDefinition(rows, { ...base, context: '/build' });
    expect((target.backend as { target?: string }).target).toBe('backend');
    expect((target.yjs as { target?: string }).target).toBe('yjs');
    expect(target.frontend).not.toHaveProperty('target');
    expect((target.agent as { context: string }).context).toBe('/build/infra/agent');
  });

  it('builds every image, the agent included, on a node base pinned by digest at the root engines.node: a moved tag reaches none', () => {
    const rows = parseBuildRows(JSON.stringify([{ service: 'backend', dockerfile: 'Dockerfile', target: 'backend' }]));
    const { target } = bakeDefinition(rows, base);
    expect(target.backend).toMatchObject({ args: { RELEASE_SHA: 'abc', NODE_IMAGE: expect.stringMatching(/-alpine@sha256:[0-9a-f]{64}$/) } });
    expect(target.agent).toMatchObject({ args: { NODE_IMAGE: expect.stringMatching(/-bookworm-slim@sha256:[0-9a-f]{64}$/) } });
  });

  it('writes every image as an archive under the tag the compose file names, and pushes none to the registry', () => {
    const rows = parseBuildRows(JSON.stringify([{ service: 'backend', dockerfile: 'Dockerfile', target: 'backend' }]));
    const bake = bakeDefinition(rows, base);
    expect(bake.group).toMatchObject({ services: { targets: ['backend'] }, agent: { targets: ['agent'] } });
    expect(bake.target.backend).toMatchObject({
      tags: ['rg.nl-ams.scw.cloud/app/backend:abc'],
      output: ['type=docker,dest=/run/images/backend.tar'],
    });
    expect(bake.target.agent).toMatchObject({ output: ['type=docker,dest=/run/images/infra-agent.tar'] });
    expect(JSON.stringify(bake)).not.toMatch(/cache-|push|type=registry/);
  });
});
