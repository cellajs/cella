import { describe, expect, it } from 'vitest'
import { manualRestoreCommands, scwConfigPathNone, stripScwProviderEnv } from './bootstrap-scw-env'

describe('scwConfigPathNone', () => {
  it('resolves relative to infraDir', () => {
    expect(scwConfigPathNone('/repo/infra')).toBe('/repo/infra/.scw-config-none')
  })
})

describe('stripScwProviderEnv', () => {
  it('removes the four SCW_* provider vars', () => {
    const env = {
      SCW_ACCESS_KEY: 'a',
      SCW_SECRET_KEY: 's',
      SCW_DEFAULT_PROJECT_ID: 'p',
      SCW_PROJECT_ID: 'p',
      PATH: '/usr/bin',
      AWS_ACCESS_KEY_ID: 'aws-a',
    }
    expect(stripScwProviderEnv(env)).toEqual({ PATH: '/usr/bin', AWS_ACCESS_KEY_ID: 'aws-a' })
  })

  it('is a no-op when nothing matches', () => {
    expect(stripScwProviderEnv({ PATH: '/usr/bin' })).toEqual({ PATH: '/usr/bin' })
  })

  it('does not mutate the input', () => {
    const env = { SCW_ACCESS_KEY: 'a', PATH: '/usr/bin' }
    stripScwProviderEnv(env)
    expect(env).toEqual({ SCW_ACCESS_KEY: 'a', PATH: '/usr/bin' })
  })
})

describe('manualRestoreCommands', () => {
  it('returns the two pulumi config set lines', () => {
    expect(manualRestoreCommands('organization/infra/production', 'SCWXX', 'sec-uuid')).toEqual([
      'pulumi config set --secret scaleway:accessKey SCWXX --stack organization/infra/production',
      'pulumi config set --secret scaleway:secretKey sec-uuid --stack organization/infra/production',
    ])
  })
})
