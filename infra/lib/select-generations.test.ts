import { describe, expect, it } from 'vitest'
import type { ServiceRollout } from './stack/control-store'
import { selectGenerations, type SelectGenerationsOptions } from './select-generations'

const genIdFor = (sha: string) => `gen-${sha}`
const base: SelectGenerationsOptions = { exclusive: false, genIdFor }

const entry = (over: Partial<ServiceRollout>): ServiceRollout => ({ seq: 1, ...over })

describe('selectGenerations', () => {
  it('deploys as an active + pending overlap for lb services', () => {
    const out = selectGenerations(entry({ active: { id: 'gen-old', sha: 'old', seq: 1 }, pendingSha: 'new' }), base)
    expect(out).toEqual([
      { id: 'gen-old', sha: 'old' },
      { id: 'gen-new', sha: 'new' },
    ])
  })

  it('collapses an exclusive service to the pending generation during a deploy', () => {
    const out = selectGenerations(entry({ active: { id: 'gen-old', sha: 'old', seq: 1 }, pendingSha: 'new' }), {
      ...base,
      exclusive: true,
    })
    expect(out).toEqual([{ id: 'gen-new', sha: 'new' }])
  })

  it('keeps only the active generation between deploys', () => {
    const out = selectGenerations(entry({ active: { id: 'gen-new', sha: 'new', seq: 2 } }), base)
    expect(out).toEqual([{ id: 'gen-new', sha: 'new' }])
  })

  it('falls back to a latest generation on first provision', () => {
    expect(selectGenerations(undefined, base)).toEqual([{ id: 'gen-latest', sha: 'latest' }])
  })

  it('equal active and pending ids collapse to one VM', () => {
    const out = selectGenerations(entry({ active: { id: 'gen-new', sha: 'new', seq: 2 }, pendingSha: 'new' }), base)
    expect(out).toEqual([{ id: 'gen-new', sha: 'new' }])
  })
})
