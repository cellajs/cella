import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSystemAdminUser, createTestSession, createTestUser, expectRefusal, rawJsonRequest } from '../helpers';
import { setTestConfig } from '../test-utils';
import { clearSecurityTestData } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

type Page = { results: { id: string }[]; nextPageToken?: string; totalSize: number };

/**
 * A page token is sealed by the server (AEP-158): a client that reads, alters or forges one, or replays it with other
 * params or on another list, gets a 400 and never a page from a position it chose. Only `maxPageSize` and `skip` may
 * change between pages.
 */
describe('Page tokens', async () => {
  let cookie: string;
  const read = async (path: string, query: Record<string, string>) => {
    const { status, body } = await rawJsonRequest(`${path}?${new URLSearchParams(query)}`, cookie);
    return { status, body: body as Page, answer: { status, body } };
  };

  beforeAll(async () => {
    await clearSecurityTestData();
    const admin = await createSystemAdminUser('page-token-admin@example.com');
    for (const name of ['one', 'two', 'three', 'four']) await createTestUser(`page-token-${name}@example.com`);
    cookie = await createTestSession(admin);
  });

  afterAll(async () => await clearSecurityTestData());

  const firstPage = async () => {
    const first = await read('/users', { maxPageSize: '2', orderBy: 'email asc' });
    expect(first.status).toBe(200);
    expect(first.body.nextPageToken).toEqual(expect.any(String));
    return { first: first.body, token: first.body.nextPageToken ?? '' };
  };

  it('continues after the last result, and ends with no token', async () => {
    const { first, token } = await firstPage();
    const rest = await read('/users', { pageToken: token, maxPageSize: '10', orderBy: 'email asc' });

    expect(rest.status).toBe(200);
    expect(rest.body.nextPageToken).toBeUndefined();
    expect([...first.results, ...rest.body.results].map(({ id }) => id)).toHaveLength(first.totalSize);
    expect(new Set([...first.results, ...rest.body.results].map(({ id }) => id)).size).toBe(first.totalSize);
  });

  it('holds no position a client can read', async () => {
    const { token } = await firstPage();
    const decoded = token
      .split(':')
      .map((part) => Buffer.from(part, 'base64url').toString('utf8'))
      .join(':');
    expect(decoded).not.toContain('offset');
  });

  it('must not open when altered', async () => {
    const { token } = await firstPage();
    const parts = token.split(':');
    const ciphertext = Buffer.from(parts[2], 'base64url');
    ciphertext[0] ^= 1;
    const altered = [...parts.slice(0, 2), ciphertext.toString('base64url'), ...parts.slice(3)].join(':');

    await expectRefusal((await read('/users', { pageToken: altered, orderBy: 'email asc' })).answer, 400, 'invalid_page_token');
  });

  it.each([
    ['a token the client wrote', `v1:${Buffer.from('{"offset":0}').toString('base64url')}`],
    ['a token of another format', Buffer.from('{"offset":0}').toString('base64url')],
  ])('must not accept %s', async (_, pageToken) => {
    await expectRefusal((await read('/users', { pageToken, orderBy: 'email asc' })).answer, 400, 'invalid_page_token');
  });

  it.each([
    ['another order', { orderBy: 'email desc' }],
    ['the default order', {}],
    ['a search', { orderBy: 'email asc', q: 'page-token' }],
    ['a filter', { orderBy: 'email asc', role: 'admin' }],
  ])('must not open with %s', async (_, query: Record<string, string>) => {
    const { token } = await firstPage();
    await expectRefusal((await read('/users', { ...query, pageToken: token })).answer, 400, 'invalid_page_token');
  });

  it.each(['/requests', '/tenants'])('must not open on another list, %s', async (path) => {
    const { token } = await firstPage();
    await expectRefusal((await read(path, { orderBy: 'createdAt desc', pageToken: token })).answer, 400, 'invalid_page_token');
  });

  it('opens with another page size and a skip, which may change between pages', async () => {
    const { first, token } = await firstPage();
    const page = await read('/users', { pageToken: token, maxPageSize: '1', skip: '1', orderBy: 'email asc' });

    expect(page.status).toBe(200);
    expect(page.body.results).toHaveLength(1);
    expect(first.results.map(({ id }) => id)).not.toContain(page.body.results[0]?.id);
  });
});
