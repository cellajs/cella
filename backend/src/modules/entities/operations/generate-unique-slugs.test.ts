import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbContext } from '#/core/context';
import { slugFromName } from '#/utils/slug';

/** The slugs the database holds. */
const stored = new Set<string>();
vi.mock('#/modules/entities/operations/check-slug', () => ({ checkSlugAvailable: async (_ctx: unknown, slug: string) => !stored.has(slug) }));

const { generateUniqueSlugs } = await import('#/modules/entities/operations/generate-unique-slugs');

// The slug check is mocked, so no connection is read.
const ctx = {} as DbContext;
const validSlug = /^[a-z0-9]+(-{0,3}[a-z0-9]+)*$/;

describe('slugFromName', () => {
  it('keeps the slug characters of a name, and leaves a slug as it is', () => {
    expect(slugFromName('Intro to Biology (2026)')).toBe('intro-to-biology-2026');
    expect(slugFromName('alice-acme')).toBe('alice-acme');
    expect(slugFromName('生物学')).toBe('');
  });

  it('cuts a long name so the slug fits its column with a suffix, without a trailing dash', () => {
    const slug = slugFromName(`${'a'.repeat(236)} ${'b'.repeat(40)}`);
    expect(slug).toBe('a'.repeat(236));
  });
});

describe('generateUniqueSlugs', () => {
  beforeEach(() => stored.clear());

  it('gives a free name its own slug', async () => {
    expect(await generateUniqueSlugs(ctx, ['Field Notes'], 'organization')).toEqual(['field-notes']);
  });

  it('adds a suffix to a slug the database holds', async () => {
    stored.add('field-notes');
    const [slug] = await generateUniqueSlugs(ctx, ['Field Notes'], 'organization');
    expect(slug).toMatch(/^field-notes-[a-z0-9]{6}$/);
  });

  it('gives equal names in one batch different slugs, in order', async () => {
    const slugs = await generateUniqueSlugs(ctx, ['Team', 'Team', 'Team'], 'organization');
    expect(slugs[0]).toBe('team');
    expect(new Set(slugs).size).toBe(3);
    for (const slug of slugs) expect(slug).toMatch(validSlug);
  });

  it('takes the entity type as base for a name without slug characters, and lengthens a slug of one character', async () => {
    const [fromType, fromShort] = await generateUniqueSlugs(ctx, ['生物学', 'A'], 'user');
    expect(fromType).toMatch(/^user-[a-z0-9]{6}$/);
    expect(fromShort).toMatch(/^a-[a-z0-9]{6}$/);
  });
});
