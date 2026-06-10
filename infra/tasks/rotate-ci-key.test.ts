import { describe, expect, it } from 'vitest'
import { renderInstructions } from './rotate-ci-key'

describe('renderInstructions', () => {
  it('threads the stack mode into all environment-specific commands', () => {
    const out = renderInstructions({ mode: 'staging' })
    expect(out).toContain('ci-staging-deploy-tags')
    expect(out).toContain('gh secret set SCW_ACCESS_KEY --env staging')
    expect(out).toContain('pulumi config set --stack staging infra:ciApplicationId')
  })

  it('warns about the in-flight workflow race before the old app is deleted', () => {
    const out = renderInstructions({ mode: 'production' })
    expect(out).toMatch(/wait at least one hour|in-flight/i)
  })

  it('never embeds an actual secret-shaped value', () => {
    const out = renderInstructions({ mode: 'production' })
    // Should describe how to set it, not provide one.
    expect(out).toMatch(/<new access key>/)
    expect(out).toMatch(/<new secret key>/)
  })
})
