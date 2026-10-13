import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { principalNames } from '../../lib/scaleway/principals';
import type { InfraContext } from '../shared';

const maskedSecret = vi.fn();
const createApiKey = vi.fn();
const deleteApiKey = vi.fn();
const resolveApplicationIdByName = vi.fn();
const fetchAppRulesByName = vi.fn();
const resolveOrganizationId = vi.fn();
const scwFetch = vi.fn();
const resolveOperatorIdentity = vi.fn();
const acquireOwnerKey = vi.fn();

vi.mock('../prompts/masked-secret', () => ({ maskedSecret: (...args: unknown[]) => maskedSecret(...args) }));
vi.mock('../../lib/scaleway/iam-client', () => ({
  IAM_BASE: 'https://iam.test',
  createApiKey: (...args: unknown[]) => createApiKey(...args),
  deleteApiKey: (...args: unknown[]) => deleteApiKey(...args),
  resolveApplicationIdByName: (...args: unknown[]) => resolveApplicationIdByName(...args),
  fetchAppRulesByName: (...args: unknown[]) => fetchAppRulesByName(...args),
}));
vi.mock('../../lib/scaleway/scaleway-iam', () => ({ resolveOrganizationId: (...args: unknown[]) => resolveOrganizationId(...args) }));
vi.mock('../../lib/scaleway/scw-fetch', async (original) => ({
  ...(await original<typeof import('../../lib/scaleway/scw-fetch')>()),
  scwFetch: (...args: unknown[]) => scwFetch(...args),
}));
vi.mock('../../lib/scaleway/operator-identity', async (original) => ({
  ...(await original<typeof import('../../lib/scaleway/operator-identity')>()),
  resolveOperatorIdentity: () => resolveOperatorIdentity(),
}));
vi.mock('./owner-key', () => ({ acquireOwnerKey: (...args: unknown[]) => acquireOwnerKey(...args) }));

const { acquireOperatorKey, acquirePrivilegedKey, addressVerdict, readOperatorLock, refusalLines } = await import('./operator-unlock');
const { forgetSession, rememberedOperatorSecret, rememberOperatorLock } = await import('../session');

const stack = {
  appConfig: { slug: 'cella', s3: { region: 'nl-ams' } },
  environment: 'production',
  projectId: 'project-1',
} as unknown as InfraContext;
const names = principalNames('cella', 'production');
const lock = "request.ip in ['203.0.113.7']";
const present = { state: 'present' as const, cidrs: ['203.0.113.7/32'], open: false };
const refused = (status: number) => new Error(`Scaleway GET https://iam.test/x → ${status}: {"message":"no"}`);

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, text: async () => '198.51.100.9' })),
  );
  maskedSecret.mockResolvedValue('operator-secret');
  resolveOrganizationId.mockResolvedValue('org-1');
  resolveApplicationIdByName.mockResolvedValue('app-operator');
  createApiKey.mockResolvedValue({ access_key: 'SCWMINTED', secret_key: 'minted-secret' });
  deleteApiKey.mockResolvedValue(undefined);
  scwFetch.mockResolvedValue({});
  resolveOperatorIdentity.mockReturnValue({ warnings: [] });
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
    expect(lines).toEqual([
      "Scaleway does not know that secret key. Paste the secret key of 'cella-production-operator' from your password manager.",
    ]);
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
  it('must not run an action on the operator key itself: it mints a key of the operator application and revokes it on release', async () => {
    const key = await acquireOperatorKey(stack);

    expect(createApiKey).toHaveBeenCalledWith(
      { secretKey: 'operator-secret' },
      expect.objectContaining({ applicationId: 'app-operator', defaultProjectId: 'project-1' }),
    );
    expect(key).toMatchObject({ accessKey: 'SCWMINTED', secretKey: 'minted-secret', organizationId: 'org-1', minted: true, pasted: false });

    await key.release();
    await key.release();
    expect(deleteApiKey).toHaveBeenCalledTimes(1);
    expect(deleteApiKey).toHaveBeenCalledWith({ secretKey: 'operator-secret' }, 'SCWMINTED');
  });

  it('asks for the secret key once per run: the second action mints from the one typed for the first', async () => {
    await acquireOperatorKey(stack);
    await acquireOperatorKey(stack);

    expect(maskedSecret).toHaveBeenCalledTimes(1);
    expect(createApiKey).toHaveBeenCalledTimes(2);
  });

  it('must not keep a secret key Scaleway refused: the action ends, and the next one asks again', async () => {
    resolveApplicationIdByName.mockRejectedValueOnce(refused(403));

    await expect(acquireOperatorKey(stack)).rejects.toMatchObject({ name: 'ActionEnded' });
    expect(rememberedOperatorSecret()).toBeUndefined();
    expect(createApiKey).not.toHaveBeenCalled();

    await acquireOperatorKey(stack);
    expect(maskedSecret).toHaveBeenCalledTimes(2);
  });

  it('must not keep a secret key the mint refused', async () => {
    createApiKey.mockRejectedValueOnce(refused(403));

    await expect(acquireOperatorKey(stack)).rejects.toMatchObject({ name: 'ActionEnded' });
    expect(rememberedOperatorSecret()).toBeUndefined();
  });

  it('ends the action when the organization has no operator application, pointing at the action that creates it', async () => {
    resolveApplicationIdByName.mockResolvedValueOnce(null);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(acquireOperatorKey(stack)).rejects.toMatchObject({ name: 'ActionEnded' });
    expect(errors.mock.calls.flat().join(' ')).toContain('pnpm infra operator-key');
    expect(rememberedOperatorSecret()).toBeUndefined();
  });

  it('ends the action on an empty answer', async () => {
    maskedSecret.mockResolvedValueOnce('  ');
    await expect(acquireOperatorKey(stack)).rejects.toMatchObject({ name: 'ActionEnded' });
    expect(resolveOrganizationId).not.toHaveBeenCalled();
  });
});

describe('acquirePrivilegedKey', () => {
  it('takes the operator key on a stack that has an operator application', async () => {
    const key = await acquirePrivilegedKey(stack);
    expect(key.accessKey).toBe('SCWMINTED');
    expect(acquireOwnerKey).not.toHaveBeenCalled();
  });

  it('takes the operator key when this machine cannot tell whether the stack has one', async () => {
    rememberOperatorLock({ state: 'unknown', cidrs: [], open: false });
    await acquirePrivilegedKey(stack);
    expect(acquireOwnerKey).not.toHaveBeenCalled();
  });

  it('falls back to an Owner API key at the prompt only on a stack without an operator application', async () => {
    rememberOperatorLock({ state: 'absent', cidrs: [], open: false });
    acquireOwnerKey.mockResolvedValue({ accessKey: 'SCWOWNER' });

    const key = await acquirePrivilegedKey(stack);

    expect(key.accessKey).toBe('SCWOWNER');
    expect(maskedSecret).not.toHaveBeenCalled();
    expect(acquireOwnerKey).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'project-1', slug: 'cella', mode: 'production' }));
  });
});
