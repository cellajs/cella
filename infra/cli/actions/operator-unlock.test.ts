import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appPrincipalNames } from '../../lib/scaleway/principals';
import type { InfraContext } from '../shared';

const maskedSecret = vi.fn();
const input = vi.fn();
const acquireOwnerKey = vi.fn();

// The terminal prompts and the Owner key's own action: the effects a person answers. Scaleway is the fake below, behind fetch.
vi.mock('../prompts/masked-secret', () => ({ maskedSecret: (...args: unknown[]) => maskedSecret(...args) }));
vi.mock('@inquirer/prompts', () => ({ input: (...args: unknown[]) => input(...args) }));
vi.mock('./owner-key', () => ({ acquireOwnerKey: (...args: unknown[]) => acquireOwnerKey(...args) }));

const { acquireIdentityKey, acquireOperatorKey, acquirePrivilegedKey, addressVerdict, readOperatorLock, refusalLines } = await import(
  './operator-unlock'
);
const { forgetSession, rememberedOperatorKey, rememberOperatorLock } = await import('../session');

const stack = {
  appConfig: { slug: 'cella', appSlug: 'cella', s3: { region: 'nl-ams' } },
  environment: 'production',
  projectId: 'project-1',
} as unknown as InfraContext;
const names = appPrincipalNames('cella');
const lock = "request.ip in ['203.0.113.7']";
const present = { state: 'present' as const, cidrs: ['203.0.113.7/32'], open: false };

/** Who bears each access key, as IAM tells it; a number is the status IAM refuses the key with. */
const bearers = new Map<string, { application?: string; owner?: string } | number>();
/** The IAM key reads, with the secret key each was made with. */
const keyReads: Array<{ accessKey: string; secretKey: string }> = [];

/** A fake Scaleway: the IAM reads that tell a key's bearer, and the address lookup, which answers with this machine's address. */
async function fakeScaleway(url: string, init?: { headers?: Record<string, string> }) {
  const answer = (status: number, body: unknown) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });
  const path = new URL(url).pathname;
  const keyRead = path.match(/\/api-keys\/([^/]+)$/);
  if (keyRead?.[1]) {
    keyReads.push({ accessKey: keyRead[1], secretKey: init?.headers?.['X-Auth-Token'] ?? '' });
    const bearer = bearers.get(keyRead[1]);
    if (bearer === undefined) return answer(404, { message: 'not found' });
    if (typeof bearer === 'number') return answer(bearer, { message: 'no' });
    return answer(200, { access_key: keyRead[1], application_id: bearer.application, user_id: bearer.owner });
  }
  const application = path.match(/\/applications\/([^/]+)$/)?.[1];
  if (application) return answer(200, { name: application, organization_id: 'org-1' });
  const user = path.match(/\/users\/([^/]+)$/)?.[1];
  if (user) return answer(200, { email: user, type: 'owner', organization_id: 'org-1' });
  if (path.endsWith('/secrets')) return answer(200, { secrets: [], total_count: 0 });
  return { ok: true, status: 200, text: async () => '198.51.100.9' };
}

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn(fakeScaleway));
  bearers.clear();
  bearers.set('SCWOPERATOR', { application: 'cella-operator' });
  keyReads.length = 0;
  input.mockResolvedValue('SCWOPERATOR');
  maskedSecret.mockResolvedValue('operator-secret');
  rememberOperatorLock(present);
});

afterEach(() => {
  forgetSession();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe('readOperatorLock', () => {
  it('reads the addresses every rule agrees on', () => {
    expect(readOperatorLock([{ condition: lock }, { condition: lock }])).toEqual({ cidrs: ['203.0.113.7/32'], open: false });
  });

  it('must not call a policy locked when one rule has no condition: that rule admits the key from every address', () => {
    expect(readOperatorLock([{ condition: lock }, { condition: '' }])).toEqual({ cidrs: [], open: true });
  });

  it('must not call a policy locked when its rules name different addresses, or a condition of another shape', () => {
    expect(readOperatorLock([{ condition: lock }, { condition: "request.ip in ['198.51.100.9']" }]).open).toBe(true);
    expect(readOperatorLock([{ condition: 'resource.name.startsWith("/x/")' }]).open).toBe(true);
  });

  it('says nothing about a policy without rules', () => {
    expect(readOperatorLock([])).toEqual({ cidrs: [], open: false });
  });
});

describe('addressVerdict', () => {
  it('places an address inside or outside the list, and stays unknown without an address or a list', () => {
    expect(addressVerdict('203.0.113.7', present)).toBe('inside');
    expect(addressVerdict('198.51.100.9', present)).toBe('outside');
    expect(addressVerdict(undefined, present)).toBe('unknown');
    expect(addressVerdict('203.0.113.7', { state: 'present', cidrs: [], open: false })).toBe('unknown');
  });
});

describe('refusalLines', () => {
  it('calls a 401 a key Scaleway does not know, and leaves the address out of it', () => {
    const lines = refusalLines({ status: 401, detail: 'x', names, address: '198.51.100.9', lock: present });
    expect(lines).toEqual(["Scaleway does not know that secret key. Paste the key of 'cella-operator' from your password manager."]);
  });

  it('must not leave a 403 unexplained: it names this machine, the addresses the key works from, and who can change them', () => {
    const lines = refusalLines({ status: 403, detail: 'x', names, address: '198.51.100.9', lock: present });
    expect(lines[1]).toBe('This machine reaches the internet as 198.51.100.9; the key works from 203.0.113.7/32 only.');
    expect(lines[2]).toBe('Connect through the dedicated address and try again.');
    expect(lines[3]).toContain('pnpm infra operator-key');
  });

  it('must not blame an address that is on the list', () => {
    const lines = refusalLines({ status: 403, detail: 'x', names, address: '203.0.113.7', lock: present });
    expect(lines[2]).toMatch(/^The address is on the list, so this is not the address/);
  });

  it('passes on what Scaleway said for any other failure', () => {
    expect(refusalLines({ status: 500, detail: 'boom', names, lock: present })).toEqual(['Scaleway did not take the operator key: boom']);
  });
});

describe('acquireOperatorKey', () => {
  it('runs an action on the operator key itself: nothing is minted, and nothing is left to revoke', async () => {
    const key = await acquireOperatorKey(stack);

    expect(keyReads).toEqual([{ accessKey: 'SCWOPERATOR', secretKey: 'operator-secret' }]);
    expect(key).toEqual({ accessKey: 'SCWOPERATOR', secretKey: 'operator-secret', organizationId: 'org-1' });
    expect(rememberedOperatorKey()).toEqual({ accessKey: 'SCWOPERATOR', secretKey: 'operator-secret' });
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

  it('must not take the key of another application, however much that key may do', async () => {
    bearers.set('SCWOPERATOR', { application: 'cella-production-admin' });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(acquireOperatorKey(stack)).rejects.toMatchObject({ name: 'ActionEnded' });
    expect(errors.mock.calls.flat().join(' ')).toContain("not of 'cella-operator'");
    expect(rememberedOperatorKey()).toBeUndefined();
  });

  it('must not take a user key in the place of the operator key', async () => {
    bearers.set('SCWOPERATOR', { owner: 'owner@example.com' });
    await expect(acquireOperatorKey(stack)).rejects.toMatchObject({ name: 'ActionEnded' });
    expect(rememberedOperatorKey()).toBeUndefined();
  });

  it('must not keep a key Scaleway refused: the action ends, and the next one asks again', async () => {
    bearers.set('SCWOPERATOR', 403);

    await expect(acquireOperatorKey(stack)).rejects.toMatchObject({ name: 'ActionEnded' });
    expect(rememberedOperatorKey()).toBeUndefined();

    bearers.set('SCWOPERATOR', { application: 'cella-operator' });
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

describe('acquirePrivilegedKey', () => {
  it('takes the operator key on a stack that has an operator application', async () => {
    const key = await acquirePrivilegedKey(stack);
    expect(key.accessKey).toBe('SCWOPERATOR');
    expect(acquireOwnerKey).not.toHaveBeenCalled();
  });

  it('takes the operator key when this machine cannot tell whether the stack has one', async () => {
    rememberOperatorLock({ state: 'unknown', cidrs: [], open: false });
    await acquirePrivilegedKey(stack);
    expect(acquireOwnerKey).not.toHaveBeenCalled();
  });

  it('must not run a privileged action on an Owner key: an app without an operator application stops and names the action that makes it', async () => {
    rememberOperatorLock({ state: 'absent', cidrs: [], open: false });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(acquirePrivilegedKey(stack)).rejects.toMatchObject({ name: 'ActionEnded' });

    expect(acquireOwnerKey).not.toHaveBeenCalled();
    expect(errors.mock.calls.flat().join(' ')).toContain('pnpm infra operator-key');
    errors.mockRestore();
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
