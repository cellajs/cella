import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { fakeConfig } from '../helpers/fake-config'

const infraRoot = resolve(__dirname, '../..')

/** Recursively list .ts sources under a directory (no node_modules, no tests). */
function sources(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      out.push(...sources(path))
      continue
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) out.push(path)
  }
  return out
}

// Config flows ONLY through the engine-config seam; its lazy workspace
// fallback is the single allowed reference to the shared package.
describe('config inversion sweep', () => {
  it("no engine module references the shared package except engine-config's fallback", () => {
    const scanned = [
      ...sources(join(infraRoot, 'resources')),
      ...sources(join(infraRoot, 'lib')),
      ...sources(join(infraRoot, 'compose')),
      ...sources(join(infraRoot, 'tasks')),
      ...sources(join(infraRoot, 'cli')),
      ...sources(join(infraRoot, 'config')),
      ...sources(join(infraRoot, 'agent', 'src')),
      join(infraRoot, 'pulumi-context.ts'),
      join(infraRoot, 'index.ts'),
    ]
    const offenders: string[] = []
    for (const file of scanned) {
      if (file.endsWith('config/engine-config.ts')) continue
      const src = readFileSync(file, 'utf-8')
      // The shared PACKAGE ('shared', 'shared/...') or a relative escape to the
      // workspace's shared dir; cli/shared.ts (a local module) is unrelated.
      if (/from\s+'shared(?:'|\/)|from\s+'(?:\.\.\/){2,}shared'|import\('shared'\)/.test(src)) {
        offenders.push(file.replace(`${infraRoot}/`, ''))
      }
    }
    expect(offenders).toEqual([])
  })

  it('engineConfig throws before a config is loaded, then returns the injected one', async () => {
    vi.resetModules()
    const { engineConfig, setEngineConfig } = await import('../../config/engine-config')
    expect(() => engineConfig()).toThrow(/no config loaded/)
    setEngineConfig(fakeConfig({ slug: 'injected-app' }))
    expect(engineConfig().slug).toBe('injected-app')
  })

  it('loadEngineConfig resolves an INFRA_CONFIG_MODULE over the workspace fallback', async () => {
    vi.resetModules()
    const dir = mkdtempSync(join(tmpdir(), 'engine-config-'))
    const modulePath = join(dir, 'config.mjs')
    writeFileSync(modulePath, `export const engineConfig = ${JSON.stringify(fakeConfig({ slug: 'pointer-app' }))}\n`)
    process.env.INFRA_CONFIG_MODULE = modulePath
    try {
      const { loadEngineConfig } = await import('../../config/engine-config')
      const config = await loadEngineConfig()
      expect(config.slug).toBe('pointer-app')
    } finally {
      delete process.env.INFRA_CONFIG_MODULE
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
