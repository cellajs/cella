import { appConfig } from 'shared';
import { describe, expect, it } from 'vitest';
import {
  booleanTransformSchema,
  idsBodySchema,
  orderByQuerySchema,
  pageQuerySchema,
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

describe('pageQuerySchema', () => {
  it('reads the default page size from the start when the params are absent', () => {
    expect(pageQuerySchema.parse({})).toMatchObject({ maxPageSize: appConfig.pageSizes.default, skip: 0 });
  });

  it('parses complete unsigned integer strings', () => {
    expect(pageQuerySchema.parse({ skip: '12', maxPageSize: '39' })).toMatchObject({ skip: 12, maxPageSize: 39 });
  });

  it.each([
    ['0', appConfig.pageSizes.default],
    ['1000', 1000],
    ['1001', 1000],
    ['5000', 1000],
  ])('reads maxPageSize %s as %i', (maxPageSize, expected) => {
    expect(pageQuerySchema.parse({ maxPageSize }).maxPageSize).toBe(expected);
  });

  it.each([
    { skip: '-1' },
    { skip: '1.5' },
    { skip: '12junk' },
    { skip: '9007199254740992' },
    { maxPageSize: '' },
    { maxPageSize: '-1' },
    { maxPageSize: '1.5' },
    { maxPageSize: '3items' },
    { maxPageSize: '9007199254740992' },
  ])('rejects malformed or negative paging input %j', (input) => {
    expect(pageQuerySchema.safeParse(input).success).toBe(false);
  });
});

describe('orderByQuerySchema', () => {
  const schema = orderByQuerySchema(['name', 'createdAt'], 'createdAt desc');

  it.each([
    [undefined, { sort: 'createdAt', order: 'desc' }],
    ['name', { sort: 'name', order: 'asc' }],
    ['name asc', { sort: 'name', order: 'asc' }],
    ['createdAt desc', { sort: 'createdAt', order: 'desc' }],
  ])('parses %j', (input, expected) => {
    expect(schema.parse(input)).toEqual(expected);
  });

  it.each(['', 'nam', 'names', 'name up', 'name  desc', 'name desc createdAt', 'name,createdAt', '-name'])('rejects %j', (input) => {
    expect(schema.safeParse(input).success).toBe(false);
  });
});

describe('productListQuerySchema', () => {
  const schema = productListQuerySchema({ orderBy: orderByQuerySchema(['createdAt'], 'createdAt desc') });

  it('parses a range read from the query string', () => {
    expect(schema.parse({ afterSeq: '50', untilSeq: '150', maxPageSize: '1000' })).toMatchObject({ afterSeq: 50, untilSeq: 150, maxPageSize: 1000 });
    expect(schema.parse({ afterSeq: '0', untilSeq: '1' })).toMatchObject({ afterSeq: 0, untilSeq: 1 });
  });

  it('reads a normal page without bounds', () => {
    expect(schema.parse({ q: 'report', skip: '40' })).toMatchObject({ q: 'report', skip: 40 });
  });

  it.each([
    { afterSeq: '50' },
    { untilSeq: '150' },
    { afterSeq: '150', untilSeq: '150' },
    { afterSeq: '151', untilSeq: '150' },
    { afterSeq: '-1', untilSeq: '150' },
    { afterSeq: '50', untilSeq: '9007199254740992' },
    { afterSeq: '50', untilSeq: '150', q: 'report' },
    { afterSeq: '50', untilSeq: '150', skip: '1000' },
    { afterSeq: '50', untilSeq: '150', pageToken: 'v1:a:b:c' },
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
    expect(messageOf(pageQuerySchema.safeParse({ skip: 'x' }))).toBe(i18n.t('error:invalid_skip'));
    expect(messageOf(pageQuerySchema.safeParse({ maxPageSize: '-1' }))).toBe(i18n.t('error:invalid_page_size'));
    expect(messageOf(orderByQuerySchema(['name'], 'name asc').safeParse('x'))).toBe(i18n.t('error:invalid_order_by', { fields: 'name' }));
    expect(messageOf(validNameSchema.safeParse(' '))).toBe(i18n.t('error:invalid_between_num', { name: 'Name', min: 1, max: 255 }));
    expect(messageOf(validUrlSchema.safeParse('http://example.com'))).toBe(i18n.t('error:invalid_url'));
    expect(messageOf(idsBodySchema().safeParse({ ids: [] }))).toBe(i18n.t('error:invalid_min_items', { min: 'one', name: 'ID' }));
  });
});
