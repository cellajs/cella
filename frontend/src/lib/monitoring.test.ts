import { notFound, redirect } from '@tanstack/react-router';
import { describe, expect, it, vi } from 'vitest';

const captureException = vi.hoisted(() => vi.fn());

vi.mock('@sentry/browser', () => ({
  browserSessionIntegration: vi.fn(),
  browserTracingCoreIntegration: vi.fn(),
  fetchTracingIntegration: vi.fn(),
  getIsolationScope: vi.fn(),
  init: vi.fn(),
  setUser: vi.fn(),
  captureException,
}));

// The test mode's config names no DSN: this one turns reporting on, and the mocked SDK sends nothing.
vi.mock('shared/utils/monitoring-dsn', () => ({ monitoringDsn: 'http://public@localhost:9/1' }));

// The build defines the release; the module reads it as it starts the SDK.
vi.stubGlobal('__APP_VERSION__', 'test');
const { reportReactError } = await import('~/lib/monitoring');

/**
 * The router's control flow, a bug that shipped: `throw notFound()` in a component reached the root's `onCaughtError`
 * and was reported as a crash.
 */
describe('reportReactError', () => {
  it.each([
    ['notFound()', notFound()],
    ['redirect()', redirect({ to: '/' })],
  ])('reports nothing for the router’s %s', (_name, thrown) => {
    reportReactError('boundary', thrown, null);
    expect(captureException).not.toHaveBeenCalled();
  });

  it('reports a component’s error as unhandled', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    reportReactError('boundary', new Error('crash'), null);
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ mechanism: expect.objectContaining({ handled: false }) }),
    );
  });
});
