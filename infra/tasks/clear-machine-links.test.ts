import { describe, expect, it } from 'vitest';
import { renderMachineUserData } from '../lib/deploy/machine-user-data';
import { clearMachineLinks } from './clear-machine-links';

const link = (object: string, verb = 'GetObject') =>
  `https://app-boot-diag.s3.nl-ams.scw.cloud/${object}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=SCWX%40p%2F20261103%2Fnl-ams%2Fs3%2Faws4_request&X-Amz-Date=20261103T120000Z&X-Amz-Expires=900&X-Amz-Signature=${'0f'.repeat(32)}&X-Amz-SignedHeaders=host&x-id=${verb}`;

const userData = renderMachineUserData({
  slug: 'app',
  role: 'backend',
  startServices: ['backend'],
  releaseSha: 'abc',
  envFileContent: 'BACKEND_TAG=abc',
  composeContent: 'services: {}',
  agentImage: { image: 'rg/ns/infra-agent:abc', url: link('releases/abc/images/infra-agent.tar'), sha256: 'b'.repeat(64) },
  agentPorts: [{ service: 'backend', agentPort: 9000, port: 4000 }],
  drainSeconds: 10,
  links: {
    env: link('env/backend-abc.env'),
    bootAccount: link('boot-diag/backend-x-boot.log', 'PutObject'),
    archives: [{ name: 'backend', image: 'rg/ns/backend:abc', url: link('releases/abc/images/backend.tar'), sha256: 'a'.repeat(64) }],
  },
});

describe('clearMachineLinks', () => {
  it("must not leave a link in a booted machine's user data, nor its env file in the bucket", async () => {
    const stored = new Map([['srv-1', userData]]);
    const deleted: string[] = [];
    const env = { service: 'backend', env: 'env/backend-abc.env', envVersion: 'v1', bootAccount: 'boot-diag/backend-x-boot.log' };
    await clearMachineLinks(
      [env],
      [{ role: 'backend', machine: 'srv-1' }],
      {
        accountArrived: async () => true,
        userData: async (id) => stored.get(id) ?? '',
        setUserData: async (id, text) => void stored.set(id, text),
        deleteEnv: async (removed) => void deleted.push(`${removed.env}@${removed.envVersion}`),
        sleep: async () => {},
        log: () => {},
      },
      { waitMs: 60_000 },
    );
    const left = stored.get('srv-1') ?? '';
    expect(left).not.toMatch(/X-Amz-Signature=[0-9a-f]|X-Amz-Credential|app-boot-diag/);
    // The plan stays, so the metadata service still names what the machine runs.
    expect(left).toContain('"releaseSha": "abc"');
    expect(deleted).toEqual(['env/backend-abc.env@v1']);
  });
});
