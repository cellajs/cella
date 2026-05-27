import { describe, expect, it } from 'vitest'
import { assertPinnedImageTags, UnpinnedImageError, validateImageTags } from './image-tags.js'

describe('validateImageTags', () => {
  it('returns empty for fully-pinned tag set', () => {
    expect(
      validateImageTags({
        backendImageTag: 'sha-abc1234',
        cdcImageTag: 'sha-abc1234',
        yjsImageTag: 'v1.2.3',
        aiWorkerImageTag: 'sha-deadbee',
      }),
    ).toEqual([])
  })

  it('flags `latest`', () => {
    expect(validateImageTags({ backendImageTag: 'latest' })).toEqual(['infra:backendImageTag'])
  })

  it('flags empty string and undefined', () => {
    expect(validateImageTags({ a: '', b: undefined })).toEqual(['infra:a', 'infra:b'])
  })

  it('accepts SHA digests', () => {
    expect(
      validateImageTags({
        backendImageTag: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      }),
    ).toEqual([])
  })

  it('lists every unpinned tag in deterministic order', () => {
    expect(
      validateImageTags({
        backendImageTag: 'sha-1',
        cdcImageTag: 'latest',
        yjsImageTag: 'sha-2',
        aiWorkerImageTag: 'latest',
      }),
    ).toEqual(['infra:cdcImageTag', 'infra:aiWorkerImageTag'])
  })
})

describe('assertPinnedImageTags', () => {
  it('returns silently when all tags are pinned', () => {
    expect(() => assertPinnedImageTags({ backendImageTag: 'sha-1' })).not.toThrow()
  })

  it('throws UnpinnedImageError listing every violation', () => {
    try {
      assertPinnedImageTags({ backendImageTag: 'latest', cdcImageTag: undefined })
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(UnpinnedImageError)
      expect((err as UnpinnedImageError).unpinned).toEqual(['infra:backendImageTag', 'infra:cdcImageTag'])
      expect((err as Error).message).toMatch(/Refusing to deploy/)
    }
  })
})
