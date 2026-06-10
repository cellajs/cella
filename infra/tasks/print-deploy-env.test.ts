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
  securityEmail: 'security@cella.example',
  has: { yjs: false, ai: false },
  // biome-ignore lint/suspicious/noExplicitAny: typed via cast for test fixture
} as any

describe('buildDeployEnv', () => {
  it('returns exactly the allowlist of keys (no widening)', () => {
    const out = buildDeployEnv(fakeAppConfig)
    expect(Object.keys(out).sort()).toEqual([...ALLOWED_KEYS].sort())
  })

  it('derives values from appConfig', () => {
    expect(buildDeployEnv(fakeAppConfig)).toEqual({
      pulumi_stack: 'production',
      region: 'nl-ams',
      registry_ns: 'cella',
      frontend_bucket: 'cella-frontend',
      state_bucket: 'cella-pulumi-state',
      deploy_tags_bucket: 'cella-deploy-tags',
      frontend_url: 'https://cella.example',
      backend_url: 'https://api.cella.example',
      yjs_url: 'https://yjs.cella.example',
      ai_url: 'https://ai.cella.example',
      has_yjs: 'false',
      has_ai: 'false',
    })
  })

  it('strips hyphens from registry_ns', () => {
    const cfg = { ...fakeAppConfig, slug: 'my-cool-app' }
    expect(buildDeployEnv(cfg).registry_ns).toBe('mycoolapp')
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
