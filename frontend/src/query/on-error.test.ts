import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockCheckConnectivity = vi.fn();
const mockToaster = vi.fn();
const mockSetDownAlert = vi.fn();
const mockNavigate = vi.fn();
const mockFlushStores = vi.fn();

vi.mock('~/lib/connectivity', () => ({ checkConnectivity: mockCheckConnectivity }));
vi.mock('~/modules/common/toaster/toaster', () => ({ toaster: mockToaster }));
vi.mock('~/store/alert', () => ({
  useAlertStore: { getState: () => ({ setDownAlert: mockSetDownAlert }) },
}));
vi.mock('~/routes/router', () => ({ default: { navigate: mockNavigate } }));
vi.mock('~/utils/flush-stores', () => ({ flushStores: mockFlushStores }));
vi.mock('i18next', () => {
  const t = (key: string) => key;
  return { default: { t, exists: () => false }, t, exists: () => false };
});

const { ApiError } = await import('~/lib/api');
const { onError } = await import('~/query/on-error');

describe('onError network error detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Network error variants across browsers ---

  it('should trigger connectivity probe for Chrome "Failed to fetch"', () => {
    onError(new TypeError('Failed to fetch'));
    expect(mockCheckConnectivity).toHaveBeenCalledOnce();
  });

  it('should trigger connectivity probe for Safari "Load failed"', () => {
    onError(new TypeError('Load failed'));
    expect(mockCheckConnectivity).toHaveBeenCalledOnce();
  });

  it('should trigger connectivity probe for Firefox "NetworkError"', () => {
    onError(new TypeError('NetworkError when attempting to fetch resource.'));
    expect(mockCheckConnectivity).toHaveBeenCalledOnce();
  });

  it('should trigger connectivity probe case-insensitively', () => {
    onError(new TypeError('FAILED TO FETCH'));
    expect(mockCheckConnectivity).toHaveBeenCalledOnce();
  });

  // --- False positive protection ---

  it('should NOT trigger probe for unrelated TypeError', () => {
    onError(new TypeError('Cannot read properties of undefined'));
    expect(mockCheckConnectivity).not.toHaveBeenCalled();
  });

  it('should NOT trigger probe for ApiError (handled separately)', () => {
    const apiError = new ApiError({
      name: 'ApiError',
      message: 'Server error',
      status: 500,
    } as any);
    onError(apiError);
    expect(mockCheckConnectivity).not.toHaveBeenCalled();
  });

  it('should NOT trigger probe for generic Error', () => {
    onError(new Error('Something went wrong'));
    expect(mockCheckConnectivity).not.toHaveBeenCalled();
  });
});
