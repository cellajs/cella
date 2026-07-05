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
})
