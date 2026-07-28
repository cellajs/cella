import { describe, expect, it, vi } from 'vitest'
import { main } from './main'

describe('main', () => {
  it('prints version', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    await expect(main(['--version'])).resolves.toBe(0)
    expect(log).toHaveBeenCalledWith('0.1.0-dev')
    log.mockRestore()
  })

  it('reports schema support by exit code', async () => {
    await expect(main(['supports', '--schema-version', '1'])).resolves.toBe(0)
    await expect(main(['supports', '--schema-version', '2'])).resolves.toBe(1)
  })
})
