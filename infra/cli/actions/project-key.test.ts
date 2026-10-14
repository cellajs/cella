import { describe, expect, it, vi } from 'vitest';
import { keyForProject, type ProjectKeyIam } from './project-key';

const pasted = { accessKey: 'SCWPASTED', secretKey: 'pasted-secret' };

function fakeIam(record: { default_project_id?: string; user_id?: string | null; application_id?: string | null }, acceptAfterCalls = 0) {
  let mintedChecks = 0;
  const iam = {
    getApiKey: vi.fn(async (auth: { secretKey: string }, accessKey: string) => {
      if (accessKey === pasted.accessKey) return { access_key: accessKey, ...record };
      mintedChecks += 1;
      if (mintedChecks <= acceptAfterCalls) throw new Error('401');
      expect(auth.secretKey).toBe('minted-secret');
      return { access_key: accessKey };
    }),
    createApiKey: vi.fn(async () => ({ access_key: 'SCWMINTED', secret_key: 'minted-secret' })),
    deleteApiKey: vi.fn(async () => {}),
  };
  return iam as unknown as ProjectKeyIam & typeof iam;
}

const clock = (start = 1_000_000) => {
  let now = start;
  return {
    now: () => now,
    sleep: async (ms: number) => {
      now += ms;
    },
  };
};

describe('keyForProject', () => {
  it('keeps a pasted key whose preferred project is the environment`s', async () => {
    const iam = fakeIam({ default_project_id: 'project-staging', user_id: 'user-1' });
    const key = await keyForProject(pasted, 'project-staging', iam, clock());
    expect(key).toMatchObject({ ...pasted, minted: false });
    await key.release();
    expect(iam.createApiKey).not.toHaveBeenCalled();
    expect(iam.deleteApiKey).not.toHaveBeenCalled();
  });

  it('mints a key of the same user for the project when the pasted key points at another', async () => {
    const iam = fakeIam({ default_project_id: 'project-production', user_id: 'user-1' });
    const key = await keyForProject(pasted, 'project-staging', iam, clock());
    expect(key).toMatchObject({ accessKey: 'SCWMINTED', secretKey: 'minted-secret', minted: true });
    const [auth, options] = iam.createApiKey.mock.calls[0] as unknown as [{ secretKey: string }, Record<string, string>];
    expect(auth.secretKey).toBe('pasted-secret');
    expect(options).toMatchObject({ userId: 'user-1', defaultProjectId: 'project-staging' });
    expect(options.applicationId).toBeUndefined();
    expect(Date.parse(options.expiresAt as string)).toBe(1_000_000 + 3 * 60 * 60_000);
  });

  it('mints for an application when the pasted key is an application`s', async () => {
    const iam = fakeIam({ default_project_id: 'project-production', application_id: 'app-1' });
    await keyForProject(pasted, 'project-staging', iam, clock());
    expect((iam.createApiKey.mock.calls[0] as unknown as [unknown, Record<string, string>])[1]).toMatchObject({ applicationId: 'app-1' });
  });

  it('has the minted key delete itself on release, once', async () => {
    const iam = fakeIam({ default_project_id: 'project-production', user_id: 'user-1' });
    const key = await keyForProject(pasted, 'project-staging', iam, clock());
    await key.release();
    await key.release();
    expect(iam.deleteApiKey).toHaveBeenCalledTimes(1);
    expect(iam.deleteApiKey).toHaveBeenCalledWith({ secretKey: 'minted-secret' }, 'SCWMINTED');
  });

  it('deletes the minted key with the pasted key when the minted one is refused', async () => {
    const iam = fakeIam({ default_project_id: 'project-production', user_id: 'user-1' });
    iam.deleteApiKey.mockRejectedValueOnce(new Error('401'));
    const key = await keyForProject(pasted, 'project-staging', iam, clock());
    await key.release();
    expect(iam.deleteApiKey).toHaveBeenLastCalledWith({ secretKey: 'pasted-secret' }, 'SCWMINTED');
  });

  it('waits until the minted key is accepted', async () => {
    const iam = fakeIam({ default_project_id: 'project-production', user_id: 'user-1' }, 3);
    const key = await keyForProject(pasted, 'project-staging', iam, clock());
    expect(key.minted).toBe(true);
    expect(iam.getApiKey).toHaveBeenCalledTimes(5);
  });

  it('deletes the minted key and fails when it is never accepted', async () => {
    const iam = fakeIam({ default_project_id: 'project-production', user_id: 'user-1' }, 1000);
    await expect(keyForProject(pasted, 'project-staging', iam, clock())).rejects.toThrow('401');
    expect(iam.deleteApiKey).toHaveBeenCalledWith({ secretKey: 'minted-secret' }, 'SCWMINTED');
  });

  it('refuses a key that names no bearer', async () => {
    const iam = fakeIam({ default_project_id: 'project-production' });
    await expect(keyForProject(pasted, 'project-staging', iam, clock())).rejects.toThrow('names no bearer');
  });
});
