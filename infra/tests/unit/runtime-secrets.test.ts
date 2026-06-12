import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { defineRuntimeSecrets, runtimeSecretConsumers, runtimeSecrets, runtimeSecretsForConsumer, runtimeSecretsById } from '../../lib/runtime-secrets'
import runtimeSecretsConfig from '../../config/runtime-secrets.config'

const backendEnvSource = readFileSync(resolve(__dirname, '../../../backend/src/env.ts'), 'utf-8')
const cdcEnvSource = readFileSync(resolve(__dirname, '../../../cdc/src/env.ts'), 'utf-8')
const yjsEnvSource = readFileSync(resolve(__dirname, '../../../yjs/src/env.ts'), 'utf-8')

const envSources = {
  backend: backendEnvSource,
  cdc: cdcEnvSource,
  yjs: yjsEnvSource,
} as const

describe('runtime secret registry', () => {
  it('uses unique ids, secret names and env vars', () => {
    const ids = new Set<string>()
    const secretNames = new Set<string>()
    const envVars = new Set<string>()

    for (const secret of runtimeSecrets) {
      expect(ids.has(secret.id), `duplicate runtime secret id: ${secret.id}`).toBe(false)
      expect(secretNames.has(secret.secretName), `duplicate runtime secret name: ${secret.secretName}`).toBe(false)
      expect(envVars.has(secret.envVar), `duplicate runtime env var: ${secret.envVar}`).toBe(false)
      ids.add(secret.id)
      secretNames.add(secret.secretName)
      envVars.add(secret.envVar)
    }
  })

  it('assigns every runtime secret to at least one known consumer VM', () => {
    const knownConsumers = new Set(runtimeSecretConsumers)

    for (const secret of runtimeSecrets) {
      expect(secret.services.length, `${secret.id} must target at least one VM`).toBeGreaterThan(0)
      for (const consumer of secret.services) {
        expect(knownConsumers.has(consumer), `${secret.id} targets unknown VM ${consumer}`).toBe(true)
      }
    }
  })

  it('only allows random generation for pulumi-owned secrets', () => {
    for (const secret of runtimeSecrets) {
      if (secret.generation === 'random') {
        expect(secret.valueSource, `${secret.id} random generation must stay pulumi-owned`).toBe('pulumi')
      }
    }
  })

  it('keeps frontend isolated from backend runtime secrets', () => {
    expect(runtimeSecretsForConsumer('frontend')).toEqual([])
  })

  it('assigns an exact, minimal runtime secret set per VM consumer', () => {
    expect(runtimeSecretsForConsumer('cdc').map((secret) => secret.envVar)).toEqual([
      'DATABASE_CDC_URL',
      'CDC_SECRET',
    ])
    expect(runtimeSecretsForConsumer('yjs').map((secret) => secret.envVar)).toEqual([
      'DATABASE_URL',
      'YJS_SECRET',
    ])
    expect(runtimeSecretsForConsumer('frontend')).toEqual([])
  })

  it('does not leak service-exclusive secrets across VM boundaries', () => {
    const cdcVars = new Set(runtimeSecretsForConsumer('cdc').map((secret) => secret.envVar))
    const yjsVars = new Set(runtimeSecretsForConsumer('yjs').map((secret) => secret.envVar))
    const backendVars = new Set(runtimeSecretsForConsumer('backend').map((secret) => secret.envVar))

    expect(cdcVars.has('YJS_SECRET')).toBe(false)
    expect(yjsVars.has('CDC_SECRET')).toBe(false)
    expect(backendVars.has('DATABASE_CDC_URL')).toBe(false)
  })
})

describe('runtime secret schema alignment', () => {
  it('maps each backend service secret env var to a declared service env schema', () => {
    for (const secret of runtimeSecrets) {
      for (const service of secret.services) {
        if (service === 'ai') continue
        if (!(service in envSources)) continue
        const source = envSources[service as keyof typeof envSources]
        expect(source, `missing env schema fixture for ${service}`).toBeTruthy()
        expect(
          source,
          `${secret.envVar} must be declared in ${service}/src/env.ts when assigned to ${service}`,
        ).toContain(`${secret.envVar}:`)
      }
    }
  })

  it('documents ai as a backend-env wrapper instead of requiring a standalone env.ts', () => {
    const aiSecrets = runtimeSecrets.filter((secret) => runtimeSecretsById.get(secret.id)?.services.includes('ai'))
    expect(aiSecrets.length).toBeGreaterThan(0)
    expect(backendEnvSource).toContain('DATABASE_ADMIN_URL:')
    expect(backendEnvSource).toContain('SCW_AI_API_KEY:')
  })
})

describe('runtime secret config seam', () => {
  it('defineRuntimeSecrets is a typed identity that preserves the fork config', () => {
    const config = defineRuntimeSecrets({
      example: {
        secretName: 'example-secret',
        description: 'fixture',
        envVar: 'EXAMPLE_SECRET',
        required: false,
        valueSource: 'operator',
        generation: 'manual',
        services: ['backend'],
      },
    })
    expect(config).toEqual({
      example: {
        secretName: 'example-secret',
        description: 'fixture',
        envVar: 'EXAMPLE_SECRET',
        required: false,
        valueSource: 'operator',
        generation: 'manual',
        services: ['backend'],
      },
    })
  })

  it('derives runtimeSecrets from the fork config, keyed by id, preserving order', () => {
    expect(runtimeSecrets.map((secret) => secret.id)).toEqual(Object.keys(runtimeSecretsConfig))
    for (const secret of runtimeSecrets) {
      const { id, ...rest } = secret
      expect(rest).toEqual(runtimeSecretsConfig[id as keyof typeof runtimeSecretsConfig])
    }
  })
})