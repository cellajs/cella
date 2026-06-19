import { describe, expect, it } from 'vitest'
import { frontendBuildEnv, parseServiceUrls } from './print-frontend-build-env'

describe('frontendBuildEnv', () => {
  it('extracts Vite URLs from enabled services JSON', () => {
    const raw = JSON.stringify([
      { service: 'backend', public_url: 'https://api.example' },
      { service: 'frontend', public_url: 'https://app.example' },
      { service: 'cdc', public_url: '' },
    ])
    expect(frontendBuildEnv(raw)).toEqual({ VITE_BACKEND_URL: 'https://api.example', VITE_FRONTEND_URL: 'https://app.example' })
  })

  it('throws when required public URLs are absent', () => {
    expect(() => frontendBuildEnv(JSON.stringify([{ service: 'backend', public_url: 'https://api.example' }]))).toThrow(/frontend\/backend/)
  })
})

describe('parseServiceUrls', () => {
  it('rejects malformed rows', () => {
    expect(() => parseServiceUrls(JSON.stringify([{ service: 'backend' }]))).toThrow(/public_url/)
  })
})