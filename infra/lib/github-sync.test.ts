import { describe, expect, it } from 'vitest'
import { parseGithubOriginRepo } from './github-sync'

describe('parseGithubOriginRepo', () => {
  it('parses https URL with .git suffix', () => {
    expect(parseGithubOriginRepo('https://github.com/cellajs/cella.git')).toBe('cellajs/cella')
  })

  it('parses https URL without .git suffix', () => {
    expect(parseGithubOriginRepo('https://github.com/cellajs/cella')).toBe('cellajs/cella')
  })

  it('parses git@ ssh URL with .git suffix', () => {
    expect(parseGithubOriginRepo('git@github.com:cellajs/cella.git')).toBe('cellajs/cella')
  })

  it('parses git@ ssh URL without .git suffix', () => {
    expect(parseGithubOriginRepo('git@github.com:cellajs/cella')).toBe('cellajs/cella')
  })

  it('returns undefined for empty input', () => {
    expect(parseGithubOriginRepo('')).toBeUndefined()
  })

  it('returns undefined for non-github remotes', () => {
    expect(parseGithubOriginRepo('https://gitlab.com/cellajs/cella.git')).toBeUndefined()
  })

  it('returns undefined for garbage input', () => {
    expect(parseGithubOriginRepo('not a url at all')).toBeUndefined()
  })

  it('handles repo names with hyphens and digits', () => {
    expect(parseGithubOriginRepo('git@github.com:org-1/repo-2.git')).toBe('org-1/repo-2')
  })
})
