import { describe, expect, it } from 'vitest'
import { ALLOWED_KEYS, buildDeployEnv } from './print-deploy-env'

const fakeAppConfig = {
  slug: 'cella',
  mode: 'production',
  s3: { region: 'nl-ams', publicBucket: 'cella-public', privateBucket: 'cella-private', host: 's3.nl-ams.scw.cloud' },
  domain: 'cella.example',
  frontendUrl: 'https://cella.example',
  backendUrl: 'https://api.cella.example',
  yjsUrl: 'https://yjs.cella.example',
  aiUrl: 'https://ai.cella.example',
  services: {
    frontend: { enabled: true, publicUrl: 'https://cella.example' },
    backend: { enabled: true, publicUrl: 'https://api.cella.example' },
    cdc: { enabled: true },
    yjs: { enabled: false, publicUrl: 'https://yjs.cella.example' },
    ai: { enabled: false, publicUrl: 'https://ai.cella.example' },
  },
  securityEmail: 'security@cella.example',
  // biome-ignore lint/suspicious/noExplicitAny: typed via cast for test fixture
} as any

describe('buildDeployEnv', () => {
  it('returns exactly the allowlist of keys (no widening)', () => {
    const out = buildDeployEnv(fakeAppConfig)
    expect(Object.keys(out).sort()).toEqual([...ALLOWED_KEYS].sort())
  })

  it('derives values from appConfig', () => {
    expect(buildDeployEnv(fakeAppConfig)).toEqual({
      environment: 'production',
      image_tag: '',
      pulumi_stack: 'production',
      region: 'nl-ams',
      registry_ns: 'cella',
      frontend_bucket: 'cella-frontend',
      state_bucket: 'cella-pulumi-state',
      vm_reader_app: 'cella-vm-reader',
      enabled_services_json: JSON.stringify([
        {
          service: 'backend',
          public_url: 'https://api.cella.example',
          health_url: 'https://api.cella.example',
          lb_route: 'default',
          dockerfile: 'backend/Dockerfile',
          reuses_image_of: '',
          primary_rollout: true,
        },
        {
          service: 'cdc',
          public_url: '',
          health_url: '',
          lb_route: '',
          dockerfile: 'cdc/Dockerfile',
          reuses_image_of: '',
          primary_rollout: false,
        },
        {
          service: 'frontend',
          public_url: 'https://cella.example',
          health_url: 'https://cella.example',
          lb_route: 'host',
          dockerfile: 'infra/caddy/Dockerfile',
          reuses_image_of: '',
          primary_rollout: false,
        },
      ]),
      build_images_matrix: JSON.stringify([
        { service: 'backend', dockerfile: 'backend/Dockerfile' },
        { service: 'cdc', dockerfile: 'cdc/Dockerfile' },
        { service: 'frontend', dockerfile: 'infra/caddy/Dockerfile' },
      ]),
      primary_rollout_matrix: JSON.stringify([{ service: 'backend', health_url: 'https://api.cella.example' }]),
      roll_rest_matrix: JSON.stringify([
        { service: 'cdc', health_url: '' },
        { service: 'frontend', health_url: 'https://cella.example' },
      ]),
    })
  })

  it('strips hyphens from registry_ns', () => {
    const cfg = { ...fakeAppConfig, slug: 'my-cool-app' }
    expect(buildDeployEnv(cfg).registry_ns).toBe('mycoolapp')
  })

  it('emits the supplied image tag', () => {
    expect(buildDeployEnv(fakeAppConfig, { imageTag: 'abc123' }).image_tag).toBe('abc123')
  })

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
    }
    const services = JSON.parse(buildDeployEnv(cfg).enabled_services_json) as { service: string; public_url: string }[]
    expect(services.find((service) => service.service === 'frontend')?.public_url).toBe('https://service-front.example')
    expect(services.find((service) => service.service === 'backend')?.public_url).toBe('https://service-api.example')
  })

  it('no emitted value contains a secret-shaped substring', () => {
    // The output is piped into $GITHUB_OUTPUT and rendered in logs; any token,
    // key or password leaking through would be visible.
    const SECRET_PATTERN = /(SCW|sk_|api_key|bearer\s|password=|secret=)/i
    for (const v of Object.values(buildDeployEnv(fakeAppConfig))) {
      expect(v, `value "${v}"`).not.toMatch(SECRET_PATTERN)
    }
  })
})
