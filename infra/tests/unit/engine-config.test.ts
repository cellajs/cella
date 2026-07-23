import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

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

// The engine (Pulumi program + libs) consumes app config ONLY through the
// engine-config seam, so an embedder can inject its own config before importing
// the program. config/engine-config.ts holds the single workspace fallback.
describe('config inversion sweep', () => {
  it('no engine module value-imports the shared appConfig', () => {
    const scanned = [
      ...sources(join(infraRoot, 'resources')),
      ...sources(join(infraRoot, 'lib')),
      ...sources(join(infraRoot, 'compose')),
      join(infraRoot, 'pulumi-context.ts'),
      join(infraRoot, 'index.ts'),
    ]
    const offenders: string[] = []
    for (const file of scanned) {
      const src = readFileSync(file, 'utf-8')
      // Type-only imports are erased at runtime and stay allowed; dynamic
      // imports in mode-switching tasks are out of scope here.
      const valueImport = /^import\s+(?!type\s)[^;\n]*from\s+'(?:\.\.\/)+shared'/m
      if (valueImport.test(src)) offenders.push(file.replace(`${infraRoot}/`, ''))
    }
    expect(offenders).toEqual([])
  })

  it('engine-config returns the injected config once set', async () => {
    const { engineConfig, setEngineConfig } = await import('../../config/engine-config')
    const fallback = engineConfig()
    expect(fallback.slug).toBeTruthy()
    const fake = { ...fallback, slug: 'injected-app' }
    setEngineConfig(fake)
    expect(engineConfig().slug).toBe('injected-app')
  })
})
