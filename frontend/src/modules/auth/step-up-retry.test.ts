import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '~/lib/api';
import { retryAfterStepUp, StepUpDismissedError } from '~/modules/auth/step-up-retry';

const stepUpRequired = () => new ApiError({ status: 403, type: 'step_up_required', meta: { methods: ['totp'] } });

describe('retryAfterStepUp', () => {
  it('never retries an action whose step-up the user dismissed', async () => {
    const action = vi.fn().mockRejectedValue(stepUpRequired());
    const stepUp = vi.fn().mockRejectedValue(new StepUpDismissedError());

    await expect(retryAfterStepUp(action, stepUp)).rejects.toBeInstanceOf(StepUpDismissedError);
    expect(action).toHaveBeenCalledTimes(1);
  });
});
