import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { hydrateRuntimeSecrets, type FetchLike } from './runtime-secrets'

let tempDir: string | undefined

afterEach(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true })
  tempDir = undefined
})

function fetchSecret(values: Record<string, string | null>): FetchLike {
  return async (url) => {
    const id = url.split('/secrets/')[1]!.split('/')[0]!
    const value = values[id]
    if (value === null || value === undefined) return { ok: false, status: 404, text: async () => '' }
    return { ok: true, status: 200, text: async () => JSON.stringify({ data: Buffer.from(value).toString('base64') }) }
  }
}

describe('hydrateRuntimeSecrets', () => {
  it('writes deliverable secrets mode 0600', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cella-agent-'))
    const outputPath = join(tempDir, '.env.runtime')
    await hydrateRuntimeSecrets({
      manifest: [{ envVar: 'COOKIE_SECRET', secretId: 'secret-1', required: true }],
      secretKey: 'secret',
      region: 'nl-ams',
      outputPath,
      fetchImpl: fetchSecret({ 'secret-1': 'abc' }),
    })
    expect(await readFile(outputPath, 'utf-8')).toBe('COOKIE_SECRET=abc\n')
    expect((await stat(outputPath)).mode & 0o777).toBe(0o600)
  })

  it('skips missing optional secrets and fails missing required secrets', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cella-agent-'))
    await expect(hydrateRuntimeSecrets({
      manifest: [{ envVar: 'OPTIONAL', secretId: 'missing', required: false }],
      secretKey: 'secret',
      region: 'nl-ams',
      outputPath: join(tempDir, '.env.runtime'),
      fetchImpl: fetchSecret({ missing: null }),
    })).resolves.toBeUndefined()
    await expect(hydrateRuntimeSecrets({
      manifest: [{ envVar: 'REQUIRED', secretId: 'missing', required: true }],
      secretKey: 'secret',
      region: 'nl-ams',
      outputPath: join(tempDir, '.env.runtime'),
      fetchImpl: fetchSecret({ missing: null }),
    })).rejects.toThrow(/REQUIRED: missing/)
  })

  it('rejects empty and multiline values', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cella-agent-'))
    await expect(hydrateRuntimeSecrets({
      manifest: [{ envVar: 'EMPTY', secretId: 'empty', required: true }, { envVar: 'PEM', secretId: 'pem', required: true }],
      secretKey: 'secret',
      region: 'nl-ams',
      outputPath: join(tempDir, '.env.runtime'),
      fetchImpl: fetchSecret({ empty: '', pem: 'a\nb' }),
    })).rejects.toThrow(/EMPTY: empty.*PEM: multiline/)
  })
})
