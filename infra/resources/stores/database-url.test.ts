import { describe, expect, it } from 'vitest'
import type { ProvisionContext } from '../../lib/stores'
import { databaseUrl } from './database-url'
import { none } from './none'

// External stores are pure modules: no Pulumi graph, no mocks needed. They
// ignore the provision context entirely, so an empty stub satisfies the call.
const ctx = {} as ProvisionContext

describe('databaseUrl store', () => {
  it('provisions nothing', () => {
    const provisioned = databaseUrl({ services: ['api'] }).provision(ctx)
    expect(provisioned.outputs).toEqual({})
    expect(provisioned.secretValues).toEqual({})
  })

  it('contributes an operator-supplied URL secret with defaults', () => {
    const store = databaseUrl({ services: ['api', 'worker'] })
    expect(store.secrets?.()).toEqual([
      {
        id: 'databaseUrl',
        secretName: 'database-url',
        envVar: 'DATABASE_URL',
        description: 'External database connection URL (operator-supplied)',
        required: true,
        valueSource: 'operator',
        services: ['api', 'worker'],
      },
    ])
  })

  it('honors overrides and adds the optional CA contribution', () => {
    const store = databaseUrl({
      services: ['api'],
      id: 'primaryDb',
      envVar: 'PG_URL',
      secretName: 'pg-url',
      required: false,
      ca: { services: ['api', 'worker'] },
    })
    const secrets = store.secrets?.() ?? []
    expect(secrets).toHaveLength(2)
    expect(secrets[0]).toMatchObject({ id: 'primaryDb', envVar: 'PG_URL', secretName: 'pg-url', required: false })
    expect(secrets[1]).toMatchObject({
      id: 'databaseSslCa',
      envVar: 'DATABASE_SSL_CA',
      required: false,
      valueSource: 'operator',
      services: ['api', 'worker'],
    })
  })

  it('CA consumers default to the URL consumers', () => {
    const secrets = databaseUrl({ services: ['api'], ca: {} }).secrets?.() ?? []
    expect(secrets[1]?.services).toEqual(['api'])
  })
})

describe('none store', () => {
  it('provisions nothing and declares no secrets', () => {
    const store = none()
    expect(store.provision(ctx)).toEqual({ outputs: {}, secretValues: {} })
    expect(store.secrets).toBeUndefined()
  })
})
