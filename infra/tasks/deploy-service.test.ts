import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(__dirname, 'deploy-service.ts'), 'utf-8')

describe('deploy-service source invariants', () => {
  it('keeps the public deploy health gate budget above cold-boot time', () => {
    expect(source).toMatch(/const deployHealthAttempts = 120/)
    expect(source).toMatch(/attempts: deployHealthAttempts/)
  })

  it('reboots the new VM after stable private NIC replacement', () => {
    expect(source).toMatch(/action: 'reboot'/)
    expect(source).toMatch(/rebooting new generation after private NIC replacement/)
    expect(source).toMatch(/serverId: newGen\.serverId/)
  })
})