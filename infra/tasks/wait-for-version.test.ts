import { describe, expect, it, vi } from 'vitest'
import { isHealthy, parseArgs, pollForVersion, type ProbeResult } from './wait-for-version'

const SHA = 'abc1234'

describe('isHealthy', () => {
  it('accepts 204 with matching version (API services)', () => {
    expect(isHealthy({ status: 204, version: SHA }, SHA)).toBe(true)
  })

  it('accepts 200 with matching version (Caddy frontend)', () => {
    expect(isHealthy({ status: 200, version: SHA }, SHA)).toBe(true)
  })

  it('rejects a matching version on an unexpected status', () => {
    expect(isHealthy({ status: 502, version: SHA }, SHA)).toBe(false)
  })

  it('rejects a healthy status serving a stale version (old container still up)', () => {
    expect(isHealthy({ status: 204, version: 'oldsha' }, SHA)).toBe(false)
  })

  it('rejects a missing version header', () => {
    expect(isHealthy({ status: 200, version: undefined }, SHA)).toBe(false)
  })

  it('rejects a failed request (status 0)', () => {
    expect(isHealthy({ status: 0, version: undefined }, SHA)).toBe(false)
  })
})

describe('pollForVersion', () => {
  const noSleep = vi.fn(async () => {})
  const noLog = () => {}

  it('returns ok on the first healthy probe', async () => {
    const probe = vi.fn(async (): Promise<ProbeResult> => ({ status: 204, version: SHA }))
    const out = await pollForVersion({ url: 'x', expectedSha: SHA, probe, sleep: noSleep, log: noLog })
    expect(out).toEqual({ ok: true, attempts: 1, lastStatus: 204, lastVersion: SHA })
    expect(probe).toHaveBeenCalledTimes(1)
    expect(noSleep).not.toHaveBeenCalled()
  })

  it('keeps polling while a stale version is served, then succeeds', async () => {
    const results: ProbeResult[] = [
      { status: 0, version: undefined },
      { status: 204, version: 'oldsha' },
      { status: 204, version: SHA },
    ]
    let i = 0
    const probe = vi.fn(async () => results[i++])
    const out = await pollForVersion({ url: 'x', expectedSha: SHA, probe, attempts: 5, sleep: noSleep, log: noLog })
    expect(out.ok).toBe(true)
    expect(out.attempts).toBe(3)
    expect(probe).toHaveBeenCalledTimes(3)
  })

  it('fails after exhausting the attempt budget and reports the last seen state', async () => {
    const probe = vi.fn(async (): Promise<ProbeResult> => ({ status: 204, version: 'oldsha' }))
    const out = await pollForVersion({ url: 'x', expectedSha: SHA, probe, attempts: 3, sleep: noSleep, log: noLog })
    expect(out).toEqual({ ok: false, attempts: 3, lastStatus: 204, lastVersion: 'oldsha' })
    expect(probe).toHaveBeenCalledTimes(3)
  })

  it('does not sleep after the final failed attempt', async () => {
    const sleep = vi.fn(async () => {})
    const probe = vi.fn(async (): Promise<ProbeResult> => ({ status: 500, version: undefined }))
    await pollForVersion({ url: 'x', expectedSha: SHA, probe, attempts: 3, sleep, log: noLog })
    // sleeps between attempts only: 3 attempts => 2 sleeps
    expect(sleep).toHaveBeenCalledTimes(2)
  })

  it('fast-fails with the reconciler reason on a terminal rollout failure (exit 5)', async () => {
    const probe = vi.fn(async (): Promise<ProbeResult> => ({ status: 502, version: undefined }))
    const status = vi.fn(() => ({ desired: SHA, result: 'failed', exitCode: '5', reason: 'bluegreen_rolled_back slot=green' }))
    const out = await pollForVersion({ url: 'x', expectedSha: SHA, probe, attempts: 10, sleep: noSleep, log: noLog, status })
    expect(out.ok).toBe(false)
    expect(out.attempts).toBe(1)
    expect(out.failReason).toBe('bluegreen_rolled_back slot=green')
    // bailed before burning the budget
    expect(probe).toHaveBeenCalledTimes(1)
  })

  it('keeps polling through a self-healing infra transient (exit 3 pull), then succeeds', async () => {
    const results: ProbeResult[] = [
      { status: 503, version: undefined },
      { status: 204, version: SHA },
    ]
    let i = 0
    const probe = vi.fn(async () => results[i++])
    // pull_exhausted is exit 3 — NOT terminal; the next tick self-heals.
    const status = vi.fn(() => ({ desired: SHA, result: 'failed', exitCode: '3', reason: 'pull_exhausted' }))
    const out = await pollForVersion({ url: 'x', expectedSha: SHA, probe, attempts: 5, sleep: noSleep, log: noLog, status })
    expect(out.ok).toBe(true)
    expect(out.attempts).toBe(2)
    expect(out.failReason).toBeUndefined()
  })

  it('ignores a failed status for a different sha (stale prior deploy)', async () => {
    const probe = vi.fn(async (): Promise<ProbeResult> => ({ status: 204, version: 'oldsha' }))
    const status = vi.fn(() => ({ desired: 'someother', result: 'failed', exitCode: '5', reason: 'old failure' }))
    const out = await pollForVersion({ url: 'x', expectedSha: SHA, probe, attempts: 3, sleep: noSleep, log: noLog, status })
    expect(out.ok).toBe(false)
    expect(out.failReason).toBeUndefined()
    expect(probe).toHaveBeenCalledTimes(3)
  })

  it('keeps polling while the reconciler reports a rolling phase', async () => {
    const results: ProbeResult[] = [
      { status: 502, version: undefined },
      { status: 204, version: SHA },
    ]
    let i = 0
    const probe = vi.fn(async () => results[i++])
    const status = vi.fn(() => ({ desired: SHA, result: 'rolling', phase: 'probing' }))
    const out = await pollForVersion({ url: 'x', expectedSha: SHA, probe, attempts: 5, sleep: noSleep, log: noLog, status })
    expect(out.ok).toBe(true)
    expect(out.attempts).toBe(2)
  })
})

describe('parseArgs', () => {
  it('parses required flags and applies defaults', () => {
    expect(parseArgs(['--url', 'https://x/health', '--sha', SHA])).toEqual({
      url: 'https://x/health',
      sha: SHA,
      attempts: 100,
      intervalMs: 3000,
      timeoutMs: 8000,
    })
  })

  it('overrides defaults when flags are provided', () => {
    const out = parseArgs(['--url', 'u', '--sha', SHA, '--attempts', '10', '--interval', '500', '--timeout', '2000'])
    expect(out).toMatchObject({ attempts: 10, intervalMs: 500, timeoutMs: 2000 })
  })

  it('throws when --url is missing', () => {
    expect(() => parseArgs(['--sha', SHA])).toThrow(/Usage/)
  })

  it('throws when --sha is missing', () => {
    expect(() => parseArgs(['--url', 'u'])).toThrow(/Usage/)
  })
})
