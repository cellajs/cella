import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InfraContext } from '../shared';

const runOwnerMoment = vi.fn();
const acquireOperatorKey = vi.fn();
const copyDeployKeyForMainJob = vi.fn();
const recordKeyRotation = vi.fn();
const runOperatorPart = vi.fn();

vi.mock('./setup-owner-moment', () => ({ runOwnerMoment: (...args: unknown[]) => runOwnerMoment(...args) }));
vi.mock('./operator-unlock', () => ({ acquireOperatorKey: (...args: unknown[]) => acquireOperatorKey(...args) }));
vi.mock('../session', () => ({ rememberOperatorKey: () => {} }));
vi.mock('./setup-operator-part', () => ({
  copyDeployKeyForMainJob: (...args: unknown[]) => copyDeployKeyForMainJob(...args),
  recordKeyRotation: (...args: unknown[]) => recordKeyRotation(...args),
  runOperatorPart: (...args: unknown[]) => runOperatorPart(...args),
}));

const { runSetup } = await import('./setup');

const context = { environment: 'staging', projectId: 'project-staging', hasCiKey: true } as InfraContext;
const operator = { accessKey: 'SCWOPERATOR', secretKey: 'operator-secret', organizationId: 'org-1' };
const ciKey = { accessKey: 'SCWNEWDEPLOY', secretKey: 'new-deploy-secret', projectId: 'project-staging', organizationId: 'org-1' };

beforeEach(() => {
  vi.clearAllMocks();
  acquireOperatorKey.mockResolvedValue(operator);
  runOwnerMoment.mockResolvedValue({ projectId: 'project-staging', ciKey });
});

describe('runSetup', () => {
  it("copies the deploy key a rotation made before recording it: the rotation deleted the key the main job's copy held", async () => {
    await runSetup(context, 'rotate-keys');
    expect(copyDeployKeyForMainJob).toHaveBeenCalledWith(context, operator, 'project-staging', ciKey);
    expect(copyDeployKeyForMainJob.mock.invocationCallOrder[0]).toBeLessThan(recordKeyRotation.mock.invocationCallOrder[0] ?? 0);
    expect(runOperatorPart).not.toHaveBeenCalled();
  });

  it('leaves the copy to the operator part on a setup, which writes it with the rest of the engine folder', async () => {
    await runSetup({ ...context, hasCiKey: false }, 'resume');
    expect(runOperatorPart).toHaveBeenCalledOnce();
    expect(copyDeployKeyForMainJob).not.toHaveBeenCalled();
    expect(recordKeyRotation).not.toHaveBeenCalled();
  });

  it('stops when the Owner moment was declined: no key was made, so nothing is copied or recorded', async () => {
    runOwnerMoment.mockResolvedValue(undefined);
    await runSetup(context, 'rotate-keys');
    expect(acquireOperatorKey).not.toHaveBeenCalled();
    expect(copyDeployKeyForMainJob).not.toHaveBeenCalled();
    expect(recordKeyRotation).not.toHaveBeenCalled();
  });
});
