import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InfraContext } from '../shared';

const resolveOperatorIdentity = vi.fn();
const reviewPlan = vi.fn();
const askToApply = vi.fn();
const runPrivilegedConverge = vi.fn();
const printRevokeReminder = vi.fn();

vi.mock('../../lib/scaleway/operator-identity', () => ({ resolveOperatorIdentity: () => resolveOperatorIdentity() }));
vi.mock('./plan', () => ({ reviewPlan: (...args: unknown[]) => reviewPlan(...args), askToApply: (...args: unknown[]) => askToApply(...args) }));
vi.mock('./privileged-converge', () => ({ runPrivilegedConverge: (...args: unknown[]) => runPrivilegedConverge(...args) }));
vi.mock('./owner-key', () => ({ printRevokeReminder: () => printRevokeReminder() }));

const { runApply } = await import('./apply');

const context = { environment: 'production' } as InfraContext;
const admin = { accessKey: 'SCWADMIN', secretKey: 'admin-secret' };
const reviewed = { passphrase: 'correct horse', basis: { checkpoint: '"aaa"', control: '"bbb"' } };

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  runPrivilegedConverge.mockResolvedValue({ completed: true, verified: true, ownerKeyPasted: false });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe('runApply', () => {
  it('must not ask for the Owner API key or take the lock for a plan the operator declined', async () => {
    resolveOperatorIdentity.mockReturnValue({ admin });
    reviewPlan.mockResolvedValue(reviewed);
    askToApply.mockResolvedValue(false);

    await runApply(context);

    expect(reviewPlan).toHaveBeenCalledWith(context, admin);
    expect(runPrivilegedConverge).not.toHaveBeenCalled();
  });

  it('hands the confirmed plan to the converge, which applies it unless the state changed', async () => {
    resolveOperatorIdentity.mockReturnValue({ admin });
    reviewPlan.mockResolvedValue(reviewed);
    askToApply.mockResolvedValue(true);

    await runApply(context);

    expect(runPrivilegedConverge).toHaveBeenCalledWith(context, expect.objectContaining({ operation: 'apply', confirmPlan: true, reviewed }));
  });

  it('plans under the lock on a machine without the admin application key', async () => {
    resolveOperatorIdentity.mockReturnValue({});

    await runApply(context);

    expect(reviewPlan).not.toHaveBeenCalled();
    expect(askToApply).not.toHaveBeenCalled();
    expect(runPrivilegedConverge).toHaveBeenCalledWith(context, expect.objectContaining({ confirmPlan: true, reviewed: undefined }));
  });

  it('ends with a failure when the up completed but the live grants still differ', async () => {
    resolveOperatorIdentity.mockReturnValue({});
    runPrivilegedConverge.mockResolvedValue({ completed: true, verified: false, ownerKeyPasted: true });

    await expect(runApply(context)).rejects.toMatchObject({ name: 'ActionEnded', exitCode: 1 });
    expect(printRevokeReminder).toHaveBeenCalled();
  });
});
