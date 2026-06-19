import { describe, expect, it } from 'vitest'
import type { ExecFn } from './exec'
import { waitForPrivateNetwork } from './boot'

describe('waitForPrivateNetwork', () => {
  it('retries until route and private address are available', async () => {
    const calls: string[] = []
    let routeAttempts = 0
    const exec: ExecFn = async (command, args) => {
      calls.push([command, ...args].join(' '))
      if (args.join(' ') === 'route get 10.0.0.1') {
        routeAttempts += 1
        return { code: routeAttempts === 1 ? 1 : 0, stdout: '', stderr: '' }
      }
      return { code: 0, stdout: '2: ens2    inet 10.0.0.12/24 brd 10.0.0.255 scope global ens2', stderr: '' }
    }

    await waitForPrivateNetwork({ exec, timeoutSeconds: 1, retryDelayMs: 1 })

    expect(calls).toEqual(['ip route get 10.0.0.1', 'ip route get 10.0.0.1', 'ip -4 addr show'])
  })

  it('fails when the private address never appears', async () => {
    const exec: ExecFn = async (_command, args) => {
      if (args.join(' ') === 'route get 10.0.0.1') return { code: 0, stdout: '', stderr: '' }
      return { code: 0, stdout: '2: ens2    inet 192.0.2.12/24 scope global ens2', stderr: '' }
    }

    await expect(waitForPrivateNetwork({ exec, timeoutSeconds: 0.001, retryDelayMs: 1 })).rejects.toThrow(/private network did not become ready/)
  })
})