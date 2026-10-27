import { appConfig } from 'shared';
import { describe, expect, it } from 'vitest';
import {
  booleanTransformSchema,
  idsBodySchema,
  paginationQuerySchema,
  productListQuerySchema,
  validDomainSchema,
  validEmailSchema,
  validNameSchema,
  validSlugSchema,
  validUrlSchema,
} from './common-schemas';

// The server builds these schemas while importing its routes, before it initializes i18n; this file keeps that order.
const { i18n } = await import('#/lib/i18n');

describe('booleanTransformSchema', () => {
  it.each([
    [undefined, false],
    ['false', false],
    ['true', true],
    [false, false],
    [true, true],
  ])('parses %j as %j', (input, expected) => {
    expect(booleanTransformSchema.parse(input)).toBe(expected);
  });

  it.each(['', '0', '1', 'TRUE', 'garbage', 0, 1])('rejects non-boolean input %j', (input) => {
    expect(booleanTransformSchema.safeParse(input).success).toBe(false);
  });
});

describe('paginationQuerySchema', () => {
  it('applies pagination defaults when parameters are absent', () => {
    expect(paginationQuerySchema.parse({})).toMatchObject({ offset: 0, limit: appConfig.requestLimits.default });
  });

  it('parses complete unsigned integer strings', () => {
    expect(paginationQuerySchema.parse({ offset: '12', limit: '39' })).toMatchObject({ offset: 12, limit: 39 });
  });

  it.each([
    { offset: '-1' },
    { offset: '1.5' },
    { offset: '12junk' },
    { offset: '9007199254740992' },
    { limit: '' },
    { limit: '0' },
    { limit: '1.5' },
    { limit: '3items' },
    { limit: '1001' },
    { limit: '9007199254740992' },
  ])('rejects malformed or out-of-range pagination input %j', (input) => {
    expect(paginationQuerySchema.safeParse(input).success).toBe(false);
  });
});

describe('productListQuerySchema', () => {
  const schema = productListQuerySchema({ sort: paginationQuerySchema.shape.sort });

  it('parses a range read from the query string', () => {
    expect(schema.parse({ afterSeq: '50', untilSeq: '150', limit: '1000' })).toMatchObject({ afterSeq: 50, untilSeq: 150, limit: 1000 });
    expect(schema.parse({ afterSeq: '0', untilSeq: '1' })).toMatchObject({ afterSeq: 0, untilSeq: 1 });
  });

  it('reads a normal page without bounds', () => {
    expect(schema.parse({ q: 'report', offset: '40' })).toMatchObject({ q: 'report', offset: 40 });
  });

  it.each([
    { afterSeq: '50' },
    { untilSeq: '150' },
    { afterSeq: '150', untilSeq: '150' },
    { afterSeq: '151', untilSeq: '150' },
    { afterSeq: '-1', untilSeq: '150' },
    { afterSeq: '50', untilSeq: '9007199254740992' },
    { afterSeq: '50', untilSeq: '150', q: 'report' },
    { afterSeq: '50', untilSeq: '150', offset: '1000' },
  ])('rejects range input %j', (input) => {
    expect(schema.safeParse(input).success).toBe(false);
  });
});

describe('normalized input schemas', () => {
  it('normalizes an email before validating it', () => {
    expect(validEmailSchema.parse(' User@Example.COM ')).toBe('user@example.com');
  });

  it.each(['not-email', 'user@example', `a@${'b'.repeat(254)}.com`])('rejects invalid email %s', (email) => {
    expect(validEmailSchema.safeParse(email).success).toBe(false);
  });

  it('normalizes a domain before validating it', () => {
    expect(validDomainSchema.parse(' Example.COM ')).toBe('example.com');
  });

  it.each(['localhost', 'a bad!.com', '-example.com', 'example-.com', 'example..com', 'example.com.'])(
    'rejects invalid or non-canonical domain %s',
    (domain) => {
      expect(validDomainSchema.safeParse(domain).success).toBe(false);
    },
  );
});

describe('validNameSchema', () => {
  it.each(['Q3: Roadmap', 'R&D / Ops', 'José’s project', 'C#', 'Launch!', '李', 'X'])('takes the name %j', (name) => {
    expect(validNameSchema.safeParse(name).success).toBe(true);
  });

  it.each(['', '   ', '<b>Acme</b>', 'line\nbreak', 'tab\there'])('refuses %j', (name) => {
    expect(validNameSchema.safeParse(name).success).toBe(false);
  });

  it('stores the name without surrounding spaces', () => {
    expect(validNameSchema.parse('  Acme  ')).toBe('Acme');
  });
});

describe('validSlugSchema', () => {
  it('refuses a slug built to backtrack, in bounded time', () => {
    const started = performance.now();
    expect(validSlugSchema.safeParse(`${'a'.repeat(28)}_`).success).toBe(false);
    expect(performance.now() - started).toBeLessThan(100);
  });
});

describe('validUrlSchema', () => {
  it('lowercases the scheme and host only: userinfo, path, query and fragment keep their case', () => {
    expect(validUrlSchema.parse('https://Example.COM/Path/To?Q=Mixed#Frag')).toBe('https://example.com/Path/To?Q=Mixed#Frag');
    expect(validUrlSchema.parse('https://User:Pass@Docs.Example.com:8443/A?b=C ')).toBe('https://User:Pass@docs.example.com:8443/A?b=C');
    expect(validUrlSchema.parse('https://EXAMPLE.com')).toBe('https://example.com');
  });

  it.each(['http://example.com', 'HTTPS://example.com', 'example.com'])('rejects %s', (url) => {
    expect(validUrlSchema.safeParse(url).success).toBe(false);
  });
});

describe('validation messages', () => {
  const messageOf = (result: { error?: { issues: { message: string }[] } }) => result.error?.issues[0]?.message;

  it('translates a message when a value fails, after i18n initialized', () => {
    expect(messageOf(paginationQuerySchema.safeParse({ offset: 'x' }))).toBe(i18n.t('error:invalid_offset'));
    expect(messageOf(paginationQuerySchema.safeParse({ limit: '0' }))).toBe(i18n.t('error:invalid_limit', { max: 1000 }));
    expect(messageOf(validNameSchema.safeParse(' '))).toBe(i18n.t('error:invalid_between_num', { name: 'Name', min: 1, max: 255 }));
    expect(messageOf(validUrlSchema.safeParse('http://example.com'))).toBe(i18n.t('error:invalid_url'));
    expect(messageOf(idsBodySchema().safeParse({ ids: [] }))).toBe(i18n.t('error:invalid_min_items', { min: 'one', name: 'ID' }));
  });
});
