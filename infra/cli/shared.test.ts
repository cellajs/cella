import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { autoAcceptDefaults, confirmOrDefault, inputOrDefault } from './shared'
import { failWithHint, withSpinner } from '../lib/utils/cli-output'

const savedArgv = process.argv
const savedNonInteractive = process.env.INFRA_NON_INTERACTIVE

beforeEach(() => {
  process.argv = ['node', 'infra-cli.ts']
  delete process.env.INFRA_NON_INTERACTIVE
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  process.argv = savedArgv
  if (savedNonInteractive === undefined) delete process.env.INFRA_NON_INTERACTIVE
  else process.env.INFRA_NON_INTERACTIVE = savedNonInteractive
  delete process.env.TEST_INPUT_VAR
  vi.restoreAllMocks()
})

describe('autoAcceptDefaults', () => {
  it('is false in a plain interactive run', () => {
    expect(autoAcceptDefaults()).toBe(false)
  })

  it('is true with the --defaults flag', () => {
    process.argv = ['node', 'infra-cli.ts', '--defaults']
    expect(autoAcceptDefaults()).toBe(true)
  })

  it('is true under INFRA_NON_INTERACTIVE', () => {
    process.env.INFRA_NON_INTERACTIVE = '1'
    expect(autoAcceptDefaults()).toBe(true)
  })
})

describe('confirmOrDefault', () => {
  it('resolves to the default without prompting under --defaults', async () => {
    process.argv = ['node', 'infra-cli.ts', '--defaults']
    await expect(confirmOrDefault({ message: 'ok?', default: true })).resolves.toBe(true)
    await expect(confirmOrDefault({ message: 'ok?', default: false })).resolves.toBe(false)
  })

  it('resolves to the default without prompting under INFRA_NON_INTERACTIVE', async () => {
    process.env.INFRA_NON_INTERACTIVE = '1'
    await expect(confirmOrDefault({ message: 'ok?', default: true })).resolves.toBe(true)
  })
})

describe('inputOrDefault', () => {
  it('prefers the env var under --defaults', async () => {
    process.argv = ['node', 'infra-cli.ts', '--defaults']
    process.env.TEST_INPUT_VAR = 'from-env'
    await expect(inputOrDefault({ message: 'name', envName: 'TEST_INPUT_VAR', default: 'fallback' })).resolves.toBe('from-env')
  })

  it('falls back to the default under --defaults when the env var is unset', async () => {
    process.argv = ['node', 'infra-cli.ts', '--defaults']
    await expect(inputOrDefault({ message: 'name', envName: 'TEST_INPUT_VAR', default: 'fallback' })).resolves.toBe('fallback')
  })

  it('resolves to empty string when neither env nor default is present', async () => {
    process.argv = ['node', 'infra-cli.ts', '--defaults']
    await expect(inputOrDefault({ message: 'name' })).resolves.toBe('')
  })
})

describe('failWithHint', () => {
  it('prints the message and the Next command, then exits with the given code', () => {
    const errors: string[] = []
    vi.spyOn(console, 'error').mockImplementation((msg?: unknown) => {
      errors.push(String(msg))
    })
    const exit = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit:${code}`)
    })
    expect(() => failWithHint('boom', { command: 'pnpm infra', description: 'why it broke' }, 3)).toThrow('exit:3')
    expect(exit).toHaveBeenCalledWith(3)
    const joined = errors.join('\n')
    expect(joined).toContain('boom')
    expect(joined).toContain('pnpm infra')
    expect(joined).toContain('why it broke')
  })
})

describe('withSpinner', () => {
  // stderr is not a TTY under vitest, so the static-line fallback path runs.
  it('returns the task result', async () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    await expect(withSpinner('doing a thing', async () => 42)).resolves.toBe(42)
  })

  it('prints a single static line to stderr when not a TTY', async () => {
    const written: string[] = []
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      written.push(String(chunk))
      return true
    })
    await withSpinner('loading projects', async () => 'ok')
    expect(written.join('')).toContain('→ loading projects')
  })

  it('propagates a rejection', async () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    await expect(withSpinner('boom', async () => Promise.reject(new Error('nope')))).rejects.toThrow('nope')
  })
})
