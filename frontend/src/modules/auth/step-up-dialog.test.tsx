// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, type ReactElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** What ran, in order, and the dialog the step-up opened. */
const seen = vi.hoisted(() => ({ calls: [] as string[], dialog: undefined as ReactElement | undefined }));

vi.mock('sdk', () => ({
  getStepUp: vi.fn(),
  sendStepUpLink: vi.fn(),
  stepUp: vi.fn(),
  signOut: vi.fn(async () => seen.calls.push('session ended')),
}));
vi.mock('~/modules/notification/use-push-subscription', () => ({
  disablePushSubscription: vi.fn(async () => seen.calls.push('push subscription dropped')),
}));
vi.mock('~/modules/seen/seen-store', () => ({
  seenStore: { getState: () => ({ flush: async () => seen.calls.push('seen marks sent') }) },
}));
vi.mock('~/utils/teardown-user-state', () => ({
  teardownUserState: vi.fn(async (wipe: boolean) => seen.calls.push(`client state cleared (wipe: ${wipe})`)),
}));
vi.mock('~/modules/common/dialoger/use-dialoger', () => ({
  useDialoger: {
    getState: () => ({
      create: (dialog: ReactElement) => {
        seen.dialog = dialog;
      },
      remove: vi.fn(),
    }),
  },
}));
vi.mock('~/modules/ui/button', () => ({
  Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));
vi.mock('~/modules/auth/passkey-credentials', () => ({ getPasskeyStepUpCredential: vi.fn() }));
vi.mock('~/modules/auth/totp-verify-code-form', () => ({ TotpConfirmationForm: () => null }));
vi.mock('~/modules/common/toaster/toaster', () => ({ toaster: { error: vi.fn() } }));
vi.mock('i18next', () => ({ default: { t: (key: string) => key } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const { openStepUpDialog } = await import('~/modules/auth/step-up-dialog');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;

afterEach(async () => {
  await act(async () => root?.unmount());
  seen.calls.length = 0;
  seen.dialog = undefined;
  vi.unstubAllGlobals();
});

describe('step-up dialog', () => {
  it('must not leave the push subscription or unsent seen marks to the next person via "Sign in again"', async () => {
    vi.stubGlobal('location', {
      pathname: '/settings/security',
      search: '?tab=mfa',
      assign: (url: string) => seen.calls.push(`navigated to ${url}`),
    });
    openStepUpDialog(['sign_in']).catch(() => {});
    const container = document.createElement('div');
    root = createRoot(container);
    await act(async () =>
      root?.render(<QueryClientProvider client={new QueryClient()}>{seen.dialog}</QueryClientProvider>),
    );

    const signInAgain = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('c:sign_in_again'),
    );
    await act(async () => signInAgain?.click());

    const signIn = `navigated to /auth/authenticate?redirect=${encodeURIComponent('/settings/security?tab=mfa')}`;
    await vi.waitFor(() => expect(seen.calls.at(-1)).toBe(signIn));
    const ended = seen.calls.indexOf('session ended');
    expect(ended).toBeGreaterThan(-1);
    // What needs the session goes while it lasts.
    expect(seen.calls.slice(0, ended)).toEqual(
      expect.arrayContaining(['push subscription dropped', 'seen marks sent']),
    );
    // The same person signs in again: their local database stays.
    expect(seen.calls).toContain('client state cleared (wipe: false)');
  });
});
