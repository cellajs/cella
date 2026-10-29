import { describe, expect, it } from 'vitest';
import { principalSecretCondition } from '../lib/runtime-secrets';
import { ALLOWED_KEYS, buildDeployEnv } from './deploy-env';

const fakeAppConfig = {
  slug: 'cella',
  mode: 'production',
  s3: { region: 'nl-ams', publicBucket: 'cella-public', privateBucket: 'cella-private', host: 's3.nl-ams.scw.cloud' },
  domain: 'cella.example',
  frontendUrl: 'https://www.cella.example',
  backendUrl: 'https://api.cella.example',
  yjsUrl: 'https://yjs.cella.example',
  mcpUrl: 'https://mcp.cella.example',
  oauthUrl: 'https://api.cella.example/oauth',
  services: {
    frontend: { enabled: true, publicUrl: 'https://www.cella.example' },
    backend: { enabled: true, publicUrl: 'https://api.cella.example' },
    cdc: { enabled: true },
    yjs: { enabled: false, publicUrl: 'https://yjs.cella.example' },
    mcp: { enabled: false, publicUrl: 'https://mcp.cella.example' },
    oauth: { enabled: false, publicUrl: 'https://api.cella.example/oauth' },
  },
  securityEmail: 'security@cella.example',
} as any;

describe('buildDeployEnv', () => {
  it('returns exactly the allowlist of keys (no widening)', () => {
    const out = buildDeployEnv(fakeAppConfig);
    expect(Object.keys(out).sort()).toEqual([...ALLOWED_KEYS].sort());
  });

  it('derives values from appConfig', () => {
    // The grant assertion rows are the shared builder's output, covered by tests/unit/secret-scope.test.ts and the singleVM cases below.
    const { grant_rows_json: _rows, ...values } = buildDeployEnv(fakeAppConfig);
    expect(values).toEqual({
      environment: 'production',
      image_tag: '',
      pulumi_stack: 'production',
      region: 'nl-ams',
      registry_ns: 'cella',
      frontend_bucket: 'cella-frontend',
      public_bucket: 'cella-public',
      state_bucket: 'cella-pulumi-state',
      diag_bucket: 'cella-boot-diag',
      enabled_services_json: JSON.stringify([
        {
          service: 'backend',
          public_url: 'https://api.cella.example',
          health_url: 'https://api.cella.example',
          lb_route: 'path',
          dockerfile: 'Dockerfile',
          reuses_image_of: '',
          primary_rollout: true,
        },
        { service: 'cdc', public_url: '', health_url: '', lb_route: '', dockerfile: 'Dockerfile', reuses_image_of: '', primary_rollout: false },
        { service: 'jobs', public_url: '', health_url: '', lb_route: '', dockerfile: '', reuses_image_of: 'backend', primary_rollout: false },
        {
          service: 'frontend',
          public_url: 'https://www.cella.example',
          health_url: 'https://www.cella.example',
          lb_route: 'default',
          dockerfile: 'infra/caddy/Dockerfile',
          reuses_image_of: '',
          primary_rollout: false,
        },
      ]),
      build_images_matrix: JSON.stringify([
        { service: 'backend', dockerfile: 'Dockerfile', target: 'backend' },
        { service: 'cdc', dockerfile: 'Dockerfile', target: 'cdc' },
        { service: 'frontend', dockerfile: 'infra/caddy/Dockerfile', target: '' },
      ]),
      primary_rollout_matrix: JSON.stringify([{ service: 'backend', health_url: 'https://api.cella.example' }]),
      roll_rest_matrix: JSON.stringify([
        { service: 'cdc', health_url: '' },
        { service: 'jobs', health_url: '' },
        { service: 'frontend', health_url: 'https://www.cella.example' },
      ]),
    });
  });

  it('singleVM: the same principals as split-VM, each reading its own folder, so placement changes no identity', () => {
    type Row = { app: string; condition: string };
    const single = JSON.parse(buildDeployEnv({ ...fakeAppConfig, singleVM: true }).grant_rows_json) as Row[];
    const split = JSON.parse(buildDeployEnv({ ...fakeAppConfig, singleVM: false }).grant_rows_json) as Row[];
    expect(single).toEqual(split);
    const backend = single.find((row) => row.app === 'cella-production-vm-backend');
    expect(backend?.condition).toBe(principalSecretCondition('backend'));
    expect(backend?.condition).not.toContain('/yjs/');
  });

  it('toggling enabled never changes a principal row', () => {
    type Row = { app: string; sets: string[]; condition: string };
    const allOn = {
      ...fakeAppConfig.services,
      yjs: { enabled: true, publicUrl: 'https://yjs.cella.example' },
      mcp: { enabled: true, publicUrl: 'https://mcp.cella.example' },
      oauth: { enabled: true, publicUrl: 'https://api.cella.example/oauth' },
    };
    for (const singleVM of [false, true]) {
      const off = JSON.parse(buildDeployEnv({ ...fakeAppConfig, singleVM }).grant_rows_json) as Row[];
      const on = JSON.parse(buildDeployEnv({ ...fakeAppConfig, singleVM, services: allOn }).grant_rows_json) as Row[];
      expect(on).toEqual(off);
    }
  });

  it('strips hyphens from registry_ns', () => {
    const cfg = { ...fakeAppConfig, slug: 'my-cool-app' };
    expect(buildDeployEnv(cfg).registry_ns).toBe('mycoolapp');
  });

  it('emits the supplied image tag', () => {
    expect(buildDeployEnv(fakeAppConfig, { imageTag: 'abc123' }).image_tag).toBe('abc123');
  });

  it('derives public URLs in enabled_services_json from appConfig.services', () => {
    const cfg = {
      ...fakeAppConfig,
      frontendUrl: 'https://legacy-front.example',
      backendUrl: 'https://legacy-api.example',
      services: {
        ...fakeAppConfig.services,
        frontend: { enabled: true, publicUrl: 'https://service-front.example' },
        backend: { enabled: true, publicUrl: 'https://service-api.example' },
      },
    };
    const services = JSON.parse(buildDeployEnv(cfg).enabled_services_json) as { service: string; public_url: string }[];
    expect(services.find((service) => service.service === 'frontend')?.public_url).toBe('https://service-front.example');
    expect(services.find((service) => service.service === 'backend')?.public_url).toBe('https://service-api.example');
  });
});
