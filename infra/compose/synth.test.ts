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
    expect(serviceNames).toEqual(['backend', 'cdc', 'yjs', 'ai', 'frontend'])
  })

  it('every logical service slug matches a compose profile', () => {
    const profiles = new Set<string>(Object.values(composeConfig.services).flatMap((s) => s.profiles))
    for (const meta of services) expect(profiles.has(meta.slug)).toBe(true)
  })

  it('expose port equals the declared healthPort for each logical service', () => {
    for (const svc of Object.values(composeConfig.services)) {
      const meta = (svc as { 'x-service'?: { healthPort: number } })['x-service']
      const expose = (svc as { expose?: readonly string[] }).expose
      if (!meta || !expose) continue
      expect(expose).toContain(String(meta.healthPort))
    }
  })
})
