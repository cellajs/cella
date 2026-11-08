import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { engineConfig as appConfig } from '../../config/engine-config';
import type { InfraContext } from '../shared';

const input = vi.fn();
const keyPairPrompt = vi.fn();
const assertIamManager = vi.fn();
const spawn = vi.fn();
const spawnSync = vi.fn();
const writeFinalDump = vi.fn();
const deleteApplicationCascade = vi.fn();

vi.mock('@inquirer/prompts', async (original) => ({
  ...(await original<typeof import('@inquirer/prompts')>()),
  input: (...args: unknown[]) => input(...args),
}));
vi.mock('node:child_process', async (original) => ({
  ...(await original<typeof import('node:child_process')>()),
  spawn: (...args: unknown[]) => spawn(...args),
  spawnSync: (...args: unknown[]) => spawnSync(...args),
}));
vi.mock('../prompts/key-pair', () => ({ keyPairPrompt: (...args: unknown[]) => keyPairPrompt(...args) }));
vi.mock('../../lib/scaleway/operator-identity', async (original) => ({
  ...(await original<typeof import('../../lib/scaleway/operator-identity')>()),
  assertIamManager: (...args: unknown[]) => assertIamManager(...args),
  organizationIdOfKey: async () => 'org-1',
}));
vi.mock('../../tasks/final-dump', () => ({ writeFinalDump: (...args: unknown[]) => writeFinalDump(...args) }));
vi.mock('../../lib/scaleway/scaleway-iam', async (original) => ({
  ...(await original<typeof import('../../lib/scaleway/scaleway-iam')>()),
  deleteApplicationCascade: (...args: unknown[]) => deleteApplicationCascade(...args),
}));

const { runTeardown, splitOwnApplication } = await import('./teardown');
const { forgetSession } = await import('../session');

const context = { appConfig, environment: 'production', projectId: 'project-1', state: 'bootstrapped', hasCiKey: true } as InfraContext;
const token = `${appConfig.slug}-production`;
const ownerDesc = { accessKey: 'SCWOWNER', bearer: 'owner', bearerId: 'user-1', name: 'owner@example.com' };

/** Nothing of the environment was touched: no Pulumi run, no dump, no identity deleted. */
const expectUntouched = () => {
  expect(spawn).not.toHaveBeenCalled();
  expect(spawnSync).not.toHaveBeenCalled();
  expect(writeFinalDump).not.toHaveBeenCalled();
  expect(deleteApplicationCascade).not.toHaveBeenCalled();
};

beforeEach(() => {
  for (const method of ['info', 'warn', 'error'] as const) vi.spyOn(console, method).mockImplementation(() => {});
  keyPairPrompt.mockResolvedValue({ accessKey: 'SCWOWNER', secretKey: 'owner-secret' });
});

afterEach(() => {
  forgetSession();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe('runTeardown', () => {
  it('must not ask for a key or touch anything without the typed environment name', async () => {
    input.mockResolvedValue(`${appConfig.slug}-staging`);
    await runTeardown(context);
    expect(keyPairPrompt).not.toHaveBeenCalled();
    expectUntouched();
  });

  it('must not tear down on a durable Owner key: one with no expiry, or more than a day left, ends the action before anything runs', async () => {
    input.mockResolvedValue(token);
    for (const expiresAt of [undefined, new Date(Date.now() + 7 * 86_400_000).toISOString()]) {
      assertIamManager.mockResolvedValueOnce({ desc: { ...ownerDesc, expiresAt }, role: 'owner' });
      await expect(runTeardown(context)).rejects.toMatchObject({ name: 'ActionEnded' });
    }
    expectUntouched();
  });
});

const apps = [
  { id: 'app-ci', name: 'cella-production-ci-deploy' },
  { id: 'app-operator', name: 'cella-production-operator' },
  { id: 'app-admin', name: 'cella-production-admin' },
];

describe('splitOwnApplication', () => {
  it('must not hand over the application the run authenticates as: deleting it revokes the key the cleanup runs on', () => {
    const { own, others } = splitOwnApplication(apps, 'app-operator');
    expect(own?.name).toBe('cella-production-operator');
    expect(others.map((app) => app.id)).toEqual(['app-ci', 'app-admin']);
  });

  it('hands over every application for an Owner API key, which belongs to none of them', () => {
    expect(splitOwnApplication(apps, undefined)).toEqual({ own: undefined, others: apps });
  });

  it('hands over every application when the run is another application than the listed ones', () => {
    expect(splitOwnApplication(apps, 'app-elsewhere').others).toHaveLength(3);
  });
});
