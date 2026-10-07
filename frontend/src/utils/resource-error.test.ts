import i18n from 'i18next';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '~/lib/api';
import { locales } from '~/lib/i18n-locales';
import { toaster } from '~/modules/common/toaster/toaster';
import { createResourceError } from '~/utils/resource-error';

vi.mock('~/modules/common/toaster/toaster', () => ({ toaster: { error: vi.fn() } }));

beforeAll(async () => {
  await i18n.init({ lng: 'en', resources: locales, ns: ['c', 'error'], defaultNS: 'c' });
});

beforeEach(() => vi.mocked(toaster.error).mockClear());

const handleError = createResourceError('attachment');
const title = 'Attachment could not be updated. Try again later.';

describe('createResourceError', () => {
  it('shows the reason the server gave for refusing the request, in the words of an app type no key describes too', () => {
    handleError('update', new ApiError({ status: 403, type: 'forbidden', entityType: 'attachment', severity: 'warn' }));
    expect(toaster.error).toHaveBeenLastCalledWith(title, { description: 'You do not have enough permission to access this attachment.' });

    const refusal = { status: 409, type: 'label_mode_locked', name: 'Mode is fixed', message: 'A primary label keeps its mode.' } as const;
    handleError('update', new ApiError({ ...refusal, severity: 'warn' }));
    expect(toaster.error).toHaveBeenLastCalledWith(title, { description: 'A primary label keeps its mode.' });
  });

  it('adds nothing for a failure that is not a refusal: a server fault, or no response at all', () => {
    handleError('update', new ApiError({ status: 500, type: 'server_error', severity: 'error' }));
    expect(toaster.error).toHaveBeenLastCalledWith(title, { description: undefined });

    handleError('update', new TypeError('Failed to fetch'));
    expect(toaster.error).toHaveBeenLastCalledWith(title, { description: undefined });
  });
});
