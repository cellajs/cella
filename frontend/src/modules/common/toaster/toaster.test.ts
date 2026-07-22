import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sonner = vi.hoisted(() => {
  const toast = Object.assign(
    vi.fn(() => 'default-id'),
    {
      success: vi.fn(() => 'success-id'),
      info: vi.fn(() => 'info-id'),
      warning: vi.fn(() => 'warning-id'),
      error: vi.fn(() => 'error-id'),
      loading: vi.fn(() => 'loading-id'),
      message: vi.fn(() => 'message-id'),
      custom: vi.fn(() => 'custom-id'),
      promise: vi.fn(() => ({ unwrap: vi.fn() })),
      dismiss: vi.fn(() => 'dismissed-id'),
      getHistory: vi.fn(() => []),
      getToasts: vi.fn(() => []),
    },
  );
  return { toast };
});

vi.mock('sonner', () => sonner);

import { toaster } from '~/modules/common/toaster/toaster';

describe('toaster', () => {
  beforeEach(() => vi.clearAllMocks());

  it('matches the callable Sonner API and returns its toast id', () => {
    expect(toaster('Saved')).toBe('default-id');
    expect(sonner.toast).toHaveBeenCalledWith('Saved', { id: 'cella:Saved' });
  });

  it('provides typed severity methods with complete option forwarding', () => {
    const options = { description: 'Attachment kept', duration: 8_000 };

    expect(toaster.info('Delete denied', options)).toBe('info-id');
    expect(sonner.toast.info).toHaveBeenCalledWith('Delete denied', {
      ...options,
      id: 'cella:Delete denied',
    });
  });

  it('maps every title-bearing Sonner method through message deduplication', () => {
    const methods = ['success', 'info', 'warning', 'error', 'loading', 'message'] as const;

    for (const method of methods) {
      expect(toaster[method](`${method} message`)).toBe(`${method}-id`);
      expect(sonner.toast[method]).toHaveBeenCalledWith(`${method} message`, {
        id: `cella:${method} message`,
      });
    }
  });

  it('preserves explicit ids and leaves non-string messages without an automatic id', () => {
    toaster.success('Saved', { id: 'save-operation' });
    const renderMessage = () => 'Rendered message';
    toaster.warning(renderMessage);

    expect(sonner.toast.success).toHaveBeenCalledWith('Saved', { id: 'save-operation' });
    expect(sonner.toast.warning).toHaveBeenCalledWith(renderMessage, undefined);
  });

  it('delegates lifecycle methods without changing their arguments', () => {
    const renderer = vi.fn(() => createElement('div'));
    const promise = Promise.resolve('done');
    const promiseOptions = { loading: 'Saving' };

    toaster.custom(renderer, { id: 'custom' });
    toaster.promise(promise, promiseOptions);
    toaster.dismiss('custom');
    toaster.getHistory();
    toaster.getToasts();

    expect(sonner.toast.custom).toHaveBeenCalledWith(renderer, { id: 'custom' });
    expect(sonner.toast.promise).toHaveBeenCalledWith(promise, promiseOptions);
    expect(sonner.toast.dismiss).toHaveBeenCalledWith('custom');
    expect(sonner.toast.getHistory).toHaveBeenCalledOnce();
    expect(sonner.toast.getToasts).toHaveBeenCalledOnce();
  });
});
