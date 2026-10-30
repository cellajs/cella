import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InfraContext } from '../shared';

const acquirePrivilegedKey = vi.fn();
const admitOperatorOrExit = vi.fn();
const reviewPlan = vi.fn();
const askToApply = vi.fn();
const runOperatorApply = vi.fn();
const openDbEndpoints = vi.fn();

vi.mock('./operator-unlock', () => ({ acquirePrivilegedKey: (...args: unknown[]) => acquirePrivilegedKey(...args) }));
vi.mock('../shared', () => ({
  endAction: (code: number) => {
    throw Object.assign(new Error('ended'), { name: 'ActionEnded', exitCode: code });
  },
  resolveVerifiedPassphrase: async () => 'correct horse',
  stackNameFor: () => 'cella/production',
}));
vi.mock('./plan', () => ({ reviewPlan: (...args: unknown[]) => reviewPlan(...args), askToApply: (...args: unknown[]) => askToApply(...args) }));
vi.mock('./operator-apply', () => ({
  admitOperatorOrExit: (...args: unknown[]) => admitOperatorOrExit(...args),
  runOperatorApply: (...args: unknown[]) => runOperatorApply(...args),
}));
vi.mock('./db-exposure', () => ({ openDbEndpoints: (...args: unknown[]) => openDbEndpoints(...args) }));
vi.mock('./owner-key', () => ({ printRevokeReminder: () => {} }));
vi.mock('./identity', () => ({ exitOnIdentityChanges: async () => {} }));

const { runApply } = await import('./apply');

const context = { environment: 'production' } as InfraContext;
const operator = { accessKey: 'SCWOPERATOR', secretKey: 'operator-secret', organizationId: 'org-1' };
const reviewed = { passphrase: 'correct horse', basis: { checkpoint: '"aaa"', control: '"bbb"' } };

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  acquirePrivilegedKey.mockResolvedValue(operator);
  openDbEndpoints.mockResolvedValue([]);
  reviewPlan.mockResolvedValue(reviewed);
  runOperatorApply.mockResolvedValue({ completed: true, verified: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe('runApply', () => {
  it('refuses while the database has a public endpoint: the plan would delete its ACL and keep it open', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    openDbEndpoints.mockResolvedValue(['db.example:6317']);

    await expect(runApply(context)).rejects.toMatchObject({ name: 'ActionEnded', exitCode: 1 });

    expect(reviewPlan).not.toHaveBeenCalled();
    expect(runOperatorApply).not.toHaveBeenCalled();
  });

  it('must not apply a plan the operator declined', async () => {
    askToApply.mockResolvedValue(false);

    await runApply(context);

    expect(reviewPlan).toHaveBeenCalledWith(context, operator, { forgetRetired: true });
    expect(runOperatorApply).not.toHaveBeenCalled();
  });

  it('lets the operator into older bucket policies before it plans: the plan reads the state', async () => {
    const order: string[] = [];
    admitOperatorOrExit.mockImplementation(async () => order.push('admit'));
    reviewPlan.mockImplementation(async () => {
      order.push('plan');
      return reviewed;
    });
    askToApply.mockResolvedValue(false);

    await runApply(context);

    expect(order).toEqual(['admit', 'plan']);
    expect(admitOperatorOrExit).toHaveBeenCalledWith(context, expect.objectContaining({ accessKey: 'SCWOPERATOR' }));
  });

  it('hands the confirmed plan to the converge, which applies it unless the state changed', async () => {
    askToApply.mockResolvedValue(true);

    await runApply(context);

    expect(runOperatorApply).toHaveBeenCalledWith(context, expect.objectContaining({ operation: 'apply', confirmPlan: true, reviewed }));
  });

  it('ends with a failure when the up completed but the live grants still differ', async () => {
    askToApply.mockResolvedValue(true);
    runOperatorApply.mockResolvedValue({ completed: true, verified: false });

    await expect(runApply(context)).rejects.toMatchObject({ name: 'ActionEnded', exitCode: 1 });
  });
});
