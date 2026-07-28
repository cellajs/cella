import { describe, expect, it } from 'vitest'
import { frontendBuildEnv, parseServiceUrls } from './print-frontend-build-env'

describe('frontendBuildEnv', () => {
  it('emits APP_MODE and config-loader URL overrides from enabled services JSON', () => {
    const raw = JSON.stringify([
      { service: 'backend', public_url: 'https://api.example' },
      { service: 'frontend', public_url: 'https://app.example' },
      { service: 'cdc', public_url: '' },
    ])
    expect(frontendBuildEnv('staging', raw)).toEqual({
      APP_MODE: 'staging',
      BACKEND_URL: 'https://api.example',
      FRONTEND_URL: 'https://app.example',
    })
  })

  it('throws when required public URLs are absent', () => {
    expect(() => frontendBuildEnv('production', JSON.stringify([{ service: 'backend', public_url: 'https://api.example' }]))).toThrow(
      /frontend\/backend/
    )
  })
})

describe('parseServiceUrls', () => {
  it('rejects malformed rows', () => {
    expect(() => parseServiceUrls(JSON.stringify([{ service: 'backend' }]))).toThrow(/public_url/)
  })
})
