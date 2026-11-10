import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appPrincipalNames } from '../../lib/scaleway/principals';
import type { InfraContext } from '../shared';

const maskedSecret = vi.fn();
const input = vi.fn();
const acquireOwnerKey = vi.fn();

// The terminal prompts and the Owner key's own action: the effects a person answers. Scaleway is the fake below, behind fetch.
// The key prompt as the person answers it: the access key, then the secret key, as the two fakes resolve them.
vi.mock('../prompts/key-pair', () => ({
  keyPairPrompt: async (opts: unknown) => {
    const accessKey = ((await input(opts)) as string).trim();
    if (!accessKey) return undefined;
    return { accessKey, secretKey: ((await maskedSecret(opts)) as string).trim() };
  },
}));
vi.mock('./owner-key', () => ({ acquireOwnerKey: (...args: unknown[]) => acquireOwnerKey(...args) }));

const { acquireIdentityKey, acquireOperatorKey, refusalLines } = await import('./operator-unlock');
const { forgetSession, rememberedOperatorKey, rememberOperatorKey } = await import('../session');

const stack = {
  appConfig: { slug: 'cella', appSlug: 'cella', s3: { region: 'nl-ams' } },
  environment: 'production',
  projectId: 'project-1',
} as unknown as InfraContext;
const names = appPrincipalNames('cella');
const inHours = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

/** Who bears each access key and when it ends, as IAM tells it; a number is the status IAM refuses the key with. */
const bearers = new Map<string, { application?: string; user?: string; expiresAt?: string } | number>();
/** The users in the operators group; undefined when the app has no group. */
let members: string[] | undefined;
/** The IAM key reads, with the secret key each was made with. */
const keyReads: Array<{ accessKey: string; secretKey: string }> = [];

/** A fake Scaleway: the IAM reads that tell a key's bearer, its end and the operators group. */
async function fakeScaleway(url: string, init?: { headers?: Record<string, string> }) {
  const answer = (status: number, body: unknown) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });
  const { pathname, searchParams } = new URL(url);
  const keyRead = pathname.match(/\/api-keys\/([^/]+)$/);
  if (keyRead?.[1]) {
    keyReads.push({ accessKey: keyRead[1], secretKey: init?.headers?.['X-Auth-Token'] ?? '' });
    const bearer = bearers.get(keyRead[1]);
    if (bearer === undefined) return answer(404, { message: 'not found' });
    if (typeof bearer === 'number') return answer(bearer, { message: 'no' });
    return answer(200, { access_key: keyRead[1], application_id: bearer.application, user_id: bearer.user, expires_at: bearer.expiresAt });
  }
  const application = pathname.match(/\/applications\/([^/]+)$/)?.[1];
  if (application) return answer(200, { name: application, organization_id: 'org-1' });
  const user = pathname.match(/\/users\/([^/]+)$/)?.[1];
  if (user) return answer(200, { email: `${user}@example.com`, type: 'member', organization_id: 'org-1' });
  if (pathname.endsWith('/groups')) {
    const name = searchParams.get('name');
    return answer(200, { groups: members && name === names.operators ? [{ id: 'group-1', name, user_ids: members }] : [] });
  }
  if (pathname.endsWith('/secrets')) return answer(200, { secrets: [], total_count: 0 });
  return answer(404, { message: `no fake for ${pathname}` });
}

const errorsPrinted = () => vi.mocked(console.error).mock.calls.flat().join(' ');

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn(fakeScaleway));
  bearers.clear();
  bearers.set('SCWOPERATOR', { application: 'cella-operator', expiresAt: inHours(8) });
  bearers.set('SCWALICE', { user: 'alice', expiresAt: inHours(8) });
  members = ['alice'];
  keyReads.length = 0;
  input.mockResolvedValue('SCWOPERATOR');
  maskedSecret.mockResolvedValue('operator-secret');
});

afterEach(() => {
  forgetSession();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe('refusalLines', () => {
  it('calls a 401 a key Scaleway does not know, and says where a one-day key is made', () => {
    const lines = refusalLines({ status: 401, detail: 'x', names });
    expect(lines[0]).toBe('Scaleway does not know that secret key.');
    expect(lines[1]).toContain("IAM → API keys → Generate, with 'cella-operator' as its bearer");
  });

  it('must not leave a 403 unexplained: a key that reads no IAM is neither the operator application nor a member, and the Owner makes both', () => {
    const lines = refusalLines({ status: 403, detail: 'x', names });
    expect(lines[0]).toContain("no key of 'cella-operator' and none of a member of 'cella-operators'");
    expect(lines[1]).toContain('pnpm infra operator-key');
  });

  it('passes on what Scaleway said for any other failure', () => {
    expect(refusalLines({ status: 500, detail: 'boom', names })).toEqual(['Scaleway did not take the key: boom']);
  });
});

describe('acquireOperatorKey', () => {
  it("runs an action on the operator application's one-day key: nothing is minted, and nothing is left to revoke", async () => {
    const key = await acquireOperatorKey(stack);

    expect(keyReads).toEqual([{ accessKey: 'SCWOPERATOR', secretKey: 'operator-secret' }]);
    expect(key).toEqual({ accessKey: 'SCWOPERATOR', secretKey: 'operator-secret', organizationId: 'org-1' });
    expect(rememberedOperatorKey()).toEqual({ accessKey: 'SCWOPERATOR', secretKey: 'operator-secret' });
  });

  it("takes a member's own one-day key: a user in the operators group", async () => {
    input.mockResolvedValue('SCWALICE');
    const key = await acquireOperatorKey(stack);
    expect(key).toEqual({ accessKey: 'SCWALICE', secretKey: 'operator-secret', organizationId: 'org-1' });
  });

  it('is one application for every environment of the app', async () => {
    const key = await acquireOperatorKey({
      ...stack,
      appConfig: { slug: 'cella-staging', appSlug: 'cella', s3: { region: 'nl-ams' } },
      environment: 'staging',
    } as never);
    expect(key.accessKey).toBe('SCWOPERATOR');
  });

  it('asks for the key once per run: the second action takes the one typed for the first', async () => {
    await acquireOperatorKey(stack);
    await acquireOperatorKey(stack);

    expect(input).toHaveBeenCalledTimes(1);
    expect(maskedSecret).toHaveBeenCalledTimes(1);
  });

  it('must not take a durable key, of the application or of a member: one with days left, or no end, is refused and the console path named', async () => {
    for (const bearer of [
      { application: 'cella-operator', expiresAt: inHours(2 * 24) },
      { application: 'cella-operator' },
      { user: 'alice', expiresAt: inHours(30 * 24) },
    ]) {
      bearers.set('SCWOPERATOR', bearer);
      await expect(acquireOperatorKey(stack)).rejects.toMatchObject({ name: 'ActionEnded' });
      expect(errorsPrinted()).toContain('must die within the day');
      expect(errorsPrinted()).toContain("IAM → API keys → Generate, with 'cella-operator' as its bearer, expiring within a day");
      expect(rememberedOperatorKey()).toBeUndefined();
    }
  });

  it('takes a key that ends within the day, up to the last hour', async () => {
    bearers.set('SCWOPERATOR', { application: 'cella-operator', expiresAt: inHours(23) });
    await expect(acquireOperatorKey(stack)).resolves.toMatchObject({ accessKey: 'SCWOPERATOR' });
  });

  it('must not take the key of another application, however much that key may do', async () => {
    bearers.set('SCWOPERATOR', { application: 'cella-production-admin', expiresAt: inHours(1) });

    await expect(acquireOperatorKey(stack)).rejects.toMatchObject({ name: 'ActionEnded' });
    expect(errorsPrinted()).toContain("not of 'cella-operator'");
    expect(rememberedOperatorKey()).toBeUndefined();
  });

  it("must not take a user's key when the user is no member of the operators group, and says who adds members", async () => {
    bearers.set('SCWOPERATOR', { user: 'mallory', expiresAt: inHours(1) });

    await expect(acquireOperatorKey(stack)).rejects.toMatchObject({ name: 'ActionEnded' });
    expect(errorsPrinted()).toContain("mallory@example.com is no member of 'cella-operators'");
    expect(errorsPrinted()).toContain('IAM → Groups → cella-operators');
    expect(rememberedOperatorKey()).toBeUndefined();
  });

  it("must not take a user's key when the app has no operators group yet: the action that makes it is named", async () => {
    members = undefined;
    bearers.set('SCWOPERATOR', { user: 'alice', expiresAt: inHours(1) });

    await expect(acquireOperatorKey(stack)).rejects.toMatchObject({ name: 'ActionEnded' });
    expect(errorsPrinted()).toContain('pnpm infra operator-key');
    expect(rememberedOperatorKey()).toBeUndefined();
  });

  it('must not keep a key Scaleway refused: the action ends, and the next one asks again', async () => {
    bearers.set('SCWOPERATOR', 403);

    await expect(acquireOperatorKey(stack)).rejects.toMatchObject({ name: 'ActionEnded' });
    expect(rememberedOperatorKey()).toBeUndefined();

    bearers.set('SCWOPERATOR', { application: 'cella-operator', expiresAt: inHours(8) });
    await acquireOperatorKey(stack);
    expect(maskedSecret).toHaveBeenCalledTimes(2);
  });

  it('ends the action on an empty answer, before any call to Scaleway', async () => {
    input.mockResolvedValueOnce('  ');
    await expect(acquireOperatorKey(stack)).rejects.toMatchObject({ name: 'ActionEnded' });
    expect(maskedSecret).not.toHaveBeenCalled();
    expect(keyReads).toEqual([]);
  });
});

describe('acquireOperatorKey with the key a setup minted', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    rememberOperatorKey({ accessKey: 'SCWMINTED', secretKey: 'minted-secret' }, { minted: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads it again while IAM refuses it: a new key and its policy take up to a minute to hold', async () => {
    bearers.set('SCWMINTED', 403);
    const pending = acquireOperatorKey(stack);
    await vi.advanceTimersByTimeAsync(20_000);
    bearers.set('SCWMINTED', { application: 'cella-operator', expiresAt: inHours(23) });
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(pending).resolves.toMatchObject({ accessKey: 'SCWMINTED' });
    expect(input).not.toHaveBeenCalled();
  });

  it('ends with the refusal of a pasted key once the minute is over', async () => {
    bearers.set('SCWMINTED', 401);
    const ended = expect(acquireOperatorKey(stack)).rejects.toMatchObject({ name: 'ActionEnded' });
    await vi.advanceTimersByTimeAsync(60_000);

    await ended;
    expect(keyReads).toHaveLength(7);
    expect(errorsPrinted()).toContain('Scaleway does not know that secret key.');
    expect(rememberedOperatorKey()).toBeUndefined();
  });
});

describe('acquireIdentityKey', () => {
  it('must not write IAM with the operator key: an identity change takes an Owner API key, whatever the stack has', async () => {
    acquireOwnerKey.mockResolvedValue({ accessKey: 'SCWOWNER' });

    const key = await acquireIdentityKey(stack, 'A teardown deletes the identities.');

    expect(key.accessKey).toBe('SCWOWNER');
    expect(input).not.toHaveBeenCalled();
    expect(acquireOwnerKey).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'project-1', slug: 'cella', mode: 'production' }));
  });
});
