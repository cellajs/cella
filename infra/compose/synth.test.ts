import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { composeConfig, serviceNames, services } from './compose'
import { OUTPUT_PATH, renderCompose } from './synth'

describe('compose synth', () => {
  it('generated compose.gen.yml is up to date (drift check)', () => {
    const current = readFileSync(OUTPUT_PATH, 'utf-8')
    expect(current).toBe(renderCompose(composeConfig))
  })

  it('derives the logical service list from x-service blocks', () => {
    expect(serviceNames).toEqual(['backend', 'cdc', 'yjs', 'mcp', 'frontend'])
  })

  it('every logical service slug matches a compose profile', () => {
    const profiles = new Set<string>(Object.values(composeConfig.services).flatMap((s) => s.profiles))
    for (const meta of services) expect(profiles.has(meta.slug)).toBe(true)
  })

  it('published port equals the declared healthPort for each logical service', () => {
    for (const svc of Object.values(composeConfig.services)) {
      const meta = svc['x-service']
      if (!meta || !svc.ports) continue
      expect(svc.ports.some((port) => port.includes(String(meta.healthPort)))).toBe(true)
    }
  })

  it('folds every co-hosted service env onto the host block (singleVM in-process wiring)', () => {
    const host = Object.values(composeConfig.services).find((s) => s['x-service']?.primaryRollout)
    expect(host).toBeDefined()
    for (const svc of Object.values(composeConfig.services)) {
      const meta = svc['x-service']
      if (!meta?.coHosted) continue
      for (const [key, value] of Object.entries(svc.environment ?? {})) {
        // Process-identity keys stay off the host: MODE/PORT configure which
        // entrypoint a *container* boots; the folded workers boot in-process.
        if (key === 'MODE' || key === 'PORT') {
          expect(host?.environment?.[key]).not.toBe(value)
          continue
        }
        expect(host?.environment?.[key], `host env should carry co-hosted ${meta.slug}'s ${key}`).toBe(value)
      }
    }
  })

  it('the host block carries the in-process worker wiring vars', () => {
    const host = Object.values(composeConfig.services).find((s) => s['x-service']?.primaryRollout)
    expect(host?.environment).toMatchObject({
      API_WS_URL: '${API_WS_URL}',
      CDC_HEALTH_PORT: '4001',
      YJS_PORT: '4002',
    })
  })
})
