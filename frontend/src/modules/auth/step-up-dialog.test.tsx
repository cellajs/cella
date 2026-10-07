// @vitest-environment jsdom
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, type ReactElement, type ReactNode, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { getStepUp, sendStepUpLink } from 'sdk';
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
vi.mock('~/modules/common/spinner', () => ({ Spinner: () => null }));
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
  vi.useRealTimers();
  vi.clearAllMocks();
  focusManager.setFocused(undefined);
});

/** Renders the dialog the last `openStepUpDialog` created, into a fresh root, with `client`. */
async function renderDialog(client: QueryClient) {
  await act(async () => root?.unmount());
  const container = document.createElement('div');
  root = createRoot(container);
  await act(async () => root?.render(<QueryClientProvider client={client}>{seen.dialog}</QueryClientProvider>));
  return container;
}

const buttonWith = (container: HTMLElement, text: string) =>
  [...container.querySelectorAll('button')].find((button) => button.textContent?.includes(text));

describe('step-up dialog', () => {
  it('must not close a later dialog via the answer an earlier emailed link left in the query cache', async () => {
    vi.stubGlobal('location', { pathname: '/settings/security', search: '', hash: '' });
    vi.mocked(sendStepUpLink).mockResolvedValue(undefined as never);
    vi.mocked(getStepUp).mockResolvedValue({ steppedUp: true } as never);
    // One client for the whole app, as in the browser: the second dialog opens with the first one's cache.
    const client = new QueryClient();

    let first = 'pending';
    openStepUpDialog(['email']).then(() => (first = 'stepped up'));
    await renderDialog(client);
    await vi.waitFor(() => expect(first).toBe('stepped up'));

    // The step-up window has passed: the session needs a new proof, and the server says so.
    vi.mocked(getStepUp).mockResolvedValue({ steppedUp: false } as never);
    let second = 'pending';
    openStepUpDialog(['passkey']).then(() => (second = 'stepped up'));
    await renderDialog(client);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(second).toBe('pending');
  });

  it('must not make a user without a second factor ask for the link, nor mail it twice', async () => {
    vi.stubGlobal('location', { pathname: '/acme/settings', search: '', hash: '' });
    vi.mocked(sendStepUpLink).mockResolvedValue(undefined as never);
    vi.mocked(getStepUp).mockResolvedValue({ steppedUp: false } as never);

    openStepUpDialog(['email', 'sign_in']).catch(() => {});
    // The app runs in StrictMode, where a mount effect runs twice in development.
    const container = document.createElement('div');
    root = createRoot(container);
    await act(async () =>
      root?.render(
        <StrictMode>
          <QueryClientProvider client={new QueryClient()}>{seen.dialog}</QueryClientProvider>
        </StrictMode>,
      ),
    );

    await vi.waitFor(() => expect(container.textContent).toContain('c:step_up_link_sent.text'));
    expect(sendStepUpLink).toHaveBeenCalledTimes(1);
  });

  it('must not mail a link to a user who holds a second factor', async () => {
    openStepUpDialog(['passkey', 'totp']).catch(() => {});
    const container = await renderDialog(new QueryClient());

    expect(buttonWith(container, 'c:passkey')).toBeTruthy();
    expect(buttonWith(container, 'c:authenticator_app')).toBeTruthy();
    expect(sendStepUpLink).not.toHaveBeenCalled();
  });

  it('must not be a dead end when the link cannot be sent', async () => {
    vi.stubGlobal('location', { pathname: '/acme/settings', search: '', hash: '' });
    vi.mocked(sendStepUpLink).mockRejectedValueOnce(new Error('too many requests'));
    vi.mocked(getStepUp).mockResolvedValue({ steppedUp: false } as never);

    openStepUpDialog(['email', 'sign_in']).catch(() => {});
    const container = await renderDialog(new QueryClient());

    // Asking again and the new sign-in both stay within reach.
    await vi.waitFor(() => expect(buttonWith(container, 'c:step_up_email')).toBeTruthy());
    expect(buttonWith(container, 'c:sign_in_again')).toBeTruthy();

    vi.mocked(sendStepUpLink).mockResolvedValue(undefined as never);
    await act(async () => buttonWith(container, 'c:step_up_email')?.click());
    await vi.waitFor(() => expect(container.textContent).toContain('c:step_up_link_sent.text'));
  });

  it('must not lose the section that asked on the way back from the emailed link', async () => {
    vi.stubGlobal('location', { pathname: '/acme/settings', search: '', hash: '#general' });
    vi.mocked(sendStepUpLink).mockResolvedValue(undefined as never);
    vi.mocked(getStepUp).mockResolvedValue({ steppedUp: true } as never);

    // The section the caller names wins over the one in view.
    openStepUpDialog(['email'], 'api-keys');
    await renderDialog(new QueryClient());
    await vi.waitFor(() => expect(sendStepUpLink).toHaveBeenLastCalledWith({ body: { redirect: '/acme/settings#api-keys' } }));

    openStepUpDialog(['email']);
    await renderDialog(new QueryClient());
    await vi.waitFor(() => expect(sendStepUpLink).toHaveBeenLastCalledWith({ body: { redirect: '/acme/settings#general' } }));
  });

  it('must not wait for its tab to show again before it carries on', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('location', { pathname: '/acme/settings', search: '', hash: '' });
    vi.mocked(sendStepUpLink).mockResolvedValue(undefined as never);
    vi.mocked(getStepUp).mockResolvedValue({ steppedUp: false } as never);

    let outcome = 'pending';
    openStepUpDialog(['email']).then(() => (outcome = 'stepped up'));
    await renderDialog(new QueryClient());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(sendStepUpLink).toHaveBeenCalledTimes(1);
    expect(outcome).toBe('pending');

    // The emailed link opens in a tab of its own: this one is hidden when the session is stepped up.
    focusManager.setFocused(false);
    vi.mocked(getStepUp).mockResolvedValue({ steppedUp: true } as never);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    expect(outcome).toBe('stepped up');
  });

  it('must not leave the push subscription or unsent seen marks to the next person via "Sign in again"', async () => {
    vi.stubGlobal('location', {
      pathname: '/settings/security',
      search: '?tab=mfa',
      hash: '',
      assign: (url: string) => seen.calls.push(`navigated to ${url}`),
    });
    vi.mocked(sendStepUpLink).mockResolvedValue(undefined as never);
    vi.mocked(getStepUp).mockResolvedValue({ steppedUp: false } as never);
    openStepUpDialog(['email', 'sign_in']).catch(() => {});
    const container = await renderDialog(new QueryClient());

    await vi.waitFor(() => expect(buttonWith(container, 'c:sign_in_again')).toBeTruthy());
    await act(async () => buttonWith(container, 'c:sign_in_again')?.click());

    const signIn = `navigated to /auth/authenticate?redirect=${encodeURIComponent('/settings/security?tab=mfa')}`;
    await vi.waitFor(() => expect(seen.calls.at(-1)).toBe(signIn));
    const ended = seen.calls.indexOf('session ended');
    expect(ended).toBeGreaterThan(-1);
    // What needs the session goes while it lasts.
    expect(seen.calls.slice(0, ended)).toEqual(expect.arrayContaining(['push subscription dropped', 'seen marks sent']));
    // The same person signs in again: their local database stays.
    expect(seen.calls).toContain('client state cleared (wipe: false)');
  });
});
