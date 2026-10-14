import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { allPrincipalNames } from '../../lib/scaleway/principals';

const keyPairOrPrompt = vi.fn();
const assertIamManager = vi.fn();

vi.mock('../shared', async (original) => ({
  ...(await original<typeof import('../shared')>()),
  keyPairOrPrompt: (...args: unknown[]) => keyPairOrPrompt(...args),
}));
vi.mock('../../lib/scaleway/operator-identity', async (original) => ({
  ...(await original<typeof import('../../lib/scaleway/operator-identity')>()),
  assertIamManager: (...args: unknown[]) => assertIamManager(...args),
  organizationIdOfKey: async () => 'org-1',
}));

const { acquireOwnerKey } = await import('./owner-key');
const { forgetSession, rememberedOwnerKey } = await import('../session');

const typed = { accessKey: 'SCWTYPED', secretKey: 'typed-secret' };
/** An application key: used as it is, so no key is minted and nothing else calls Scaleway. */
const application = { desc: { accessKey: 'SCWTYPED', bearer: 'application', bearerId: 'app-1', bearerName: 'operator' }, role: 'application' };

const acquire = () =>
  acquireOwnerKey({
    names: allPrincipalNames({ slug: 'cella', appSlug: 'cella' }, 'production'),
    projectId: 'project-1',
    slug: 'cella',
    mode: 'production',
  });

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  keyPairOrPrompt.mockImplementation(async (pair: unknown) => pair ?? typed);
  assertIamManager.mockResolvedValue(application);
});

afterEach(() => {
  forgetSession();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe('acquireOwnerKey in one run of the CLI', () => {
  it('asks once: the second privileged action uses the key typed for the first, and validates it again', async () => {
    const first = await acquire();
    const second = await acquire();

    expect(keyPairOrPrompt).toHaveBeenCalledTimes(1);
    expect(assertIamManager).toHaveBeenCalledTimes(2);
    expect(second).toMatchObject({ accessKey: first.accessKey, secretKey: 'typed-secret', minted: false });
  });

  it('must not offer a key again that failed its validation: the next action asks for one', async () => {
    await acquire();
    assertIamManager.mockRejectedValueOnce(new Error('the key was revoked'));

    await expect(acquire()).rejects.toMatchObject({ name: 'ActionEnded' });
    expect(rememberedOwnerKey()).toBeUndefined();

    await acquire();
    expect(keyPairOrPrompt).toHaveBeenCalledTimes(2);
  });

  it('must not keep a key that never passed its validation', async () => {
    assertIamManager.mockRejectedValueOnce(new Error('holds no IAMManager grant'));

    await expect(acquire()).rejects.toMatchObject({ name: 'ActionEnded' });

    expect(rememberedOwnerKey()).toBeUndefined();
  });
});
