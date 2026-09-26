import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '~/lib/api';
import { retryAfterStepUp, StepUpDismissed } from '~/modules/auth/step-up-retry';

const stepUpRequired = () => new ApiError({ status: 403, type: 'step_up_required', meta: { methods: ['totp'] } });

describe('retryAfterStepUp', () => {
  it('runs the action once more after the user stepped up, with what they can offer', async () => {
    const action = vi.fn().mockRejectedValueOnce(stepUpRequired()).mockResolvedValueOnce('done');
    const stepUp = vi.fn().mockResolvedValue(undefined);

    await expect(retryAfterStepUp(action, stepUp)).resolves.toBe('done');
    expect(stepUp).toHaveBeenCalledWith(['totp']);
    expect(action).toHaveBeenCalledTimes(2);
  });

  it('never retries an action whose step-up the user dismissed', async () => {
    const action = vi.fn().mockRejectedValue(stepUpRequired());
    const stepUp = vi.fn().mockRejectedValue(new StepUpDismissed());

    await expect(retryAfterStepUp(action, stepUp)).rejects.toBeInstanceOf(StepUpDismissed);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('asks for no step-up on any other failure', async () => {
    const refused = new ApiError({ status: 403, type: 'impersonation_forbidden' });
    const action = vi.fn().mockRejectedValue(refused);
    const stepUp = vi.fn();

    await expect(retryAfterStepUp(action, stepUp)).rejects.toBe(refused);
    expect(stepUp).not.toHaveBeenCalled();
  });
});
