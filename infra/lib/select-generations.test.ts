import { describe, expect, it } from 'vitest'
import type { ServiceRollout } from './stack/control-store'
import { selectGenerations, type SelectGenerationsOptions } from './select-generations'

const genIdFor = (sha: string) => `gen-${sha}`
const base: SelectGenerationsOptions = { exclusive: false, plane: 'foundation', pendingOwned: true, genIdFor }

const entry = (over: Partial<ServiceRollout>): ServiceRollout => ({ seq: 1, ...over })

describe('selectGenerations plane ownership', () => {
  it('monolith steady state: active + pending overlap on the foundation plane', () => {
    const out = selectGenerations(entry({ active: { id: 'gen-old', sha: 'old', seq: 1 }, pendingSha: 'new' }), base)
    expect(out).toEqual([
      { id: 'gen-old', sha: 'old' },
      { id: 'gen-new', sha: 'new' },
    ])
  })

  it('adoption, foundation scope: keeps the serving foundation-plane active and never the pending', () => {
    const out = selectGenerations(entry({ active: { id: 'gen-old', sha: 'old', seq: 1 }, pendingSha: 'new' }), {
      ...base,
      pendingOwned: false,
    })
    expect(out).toEqual([{ id: 'gen-old', sha: 'old' }])
  })

  it('adoption, generation stack: provisions only the pending (the active belongs to the foundation)', () => {
    const out = selectGenerations(entry({ active: { id: 'gen-old', sha: 'old', seq: 1 }, pendingSha: 'new' }), {
      ...base,
      plane: 'generation',
    })
    expect(out).toEqual([{ id: 'gen-new', sha: 'new' }])
  })

  it('post-adoption, foundation scope: an active promoted onto the generation plane drops out (the reap)', () => {
    const out = selectGenerations(entry({ active: { id: 'gen-new', sha: 'new', seq: 2, plane: 'generation' } }), {
      ...base,
      pendingOwned: false,
    })
    expect(out).toEqual([])
  })

  it('revert, monolith scope: skips the generation-plane active so no duplicate VM is provisioned', () => {
    const out = selectGenerations(entry({ active: { id: 'gen-old', sha: 'old', seq: 1, plane: 'generation' }, pendingSha: 'new' }), base)
    expect(out).toEqual([{ id: 'gen-new', sha: 'new' }])
  })

  it('micro steady state, generation stack: active + pending both owned', () => {
    const out = selectGenerations(entry({ active: { id: 'gen-old', sha: 'old', seq: 1, plane: 'generation' }, pendingSha: 'new' }), {
      ...base,
      plane: 'generation',
    })
    expect(out).toEqual([
      { id: 'gen-old', sha: 'old' },
      { id: 'gen-new', sha: 'new' },
    ])
  })
})

describe('selectGenerations exclusive strategy', () => {
  it('collapses to the pending generation during a deploy', () => {
    const out = selectGenerations(entry({ active: { id: 'gen-old', sha: 'old', seq: 1 }, pendingSha: 'new' }), {
      ...base,
      exclusive: true,
    })
    expect(out).toEqual([{ id: 'gen-new', sha: 'new' }])
  })

  it('adoption, foundation scope: the old exclusive VM stays until the reap', () => {
    const out = selectGenerations(entry({ active: { id: 'gen-old', sha: 'old', seq: 1 }, pendingSha: 'new' }), {
      ...base,
      exclusive: true,
      pendingOwned: false,
    })
    expect(out).toEqual([{ id: 'gen-old', sha: 'old' }])
  })
})

describe('selectGenerations first provision', () => {
  it('falls back to a latest generation on the target plane only', () => {
    expect(selectGenerations(undefined, base)).toEqual([{ id: 'gen-latest', sha: 'latest' }])
    expect(selectGenerations(undefined, { ...base, pendingOwned: false })).toEqual([])
  })

  it('does not fall back when the service is active on the other plane', () => {
    const out = selectGenerations(entry({ active: { id: 'gen-old', sha: 'old', seq: 1, plane: 'generation' } }), base)
    expect(out).toEqual([])
  })

  it('equal active and pending ids collapse to one VM', () => {
    const out = selectGenerations(entry({ active: { id: 'gen-new', sha: 'new', seq: 2 }, pendingSha: 'new' }), base)
    expect(out).toEqual([{ id: 'gen-new', sha: 'new' }])
  })
})
