import { vi } from 'vitest';

// Rate-limiter mock, applied via vitest setupFiles in core/full test modes.
vi.mock('#/middlewares/rate-limiter/core', async () => (await import('./test-utils')).rateLimiterCoreMock());
vi.mock('#/middlewares/rate-limiter/helpers', async (importOriginal) =>
  (await import('./test-utils')).rateLimiterHelpersMock(importOriginal),
);

// Every mail renders for real and is recorded for `sentMails`; test mode sends none. The config clears the record
// before each test (`clearMocks`).
vi.mock('#/lib/mailer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/lib/mailer')>();
  return { ...actual, mailer: { ...actual.mailer, prepareEmails: vi.fn(actual.mailer.prepareEmails) } };
});

// The app's outbound requests get an empty 200 (a Request's own JSON body as the answer), so no test reaches the
// network. A test that needs real fetch calls `vi.unstubAllGlobals()`; `startTestOauthServer` does.
vi.stubGlobal(
  'fetch',
  vi.fn(async (input: unknown) => {
    if (input instanceof Request) {
      const json = () =>
        input
          .clone()
          .json()
          .catch(() => ({}));
      return { ok: true, status: 200, json, text: async () => '', clone: () => input.clone() };
    }
    const answer = { json: async () => ({}), text: async () => '' };
    return { ok: true, status: 200, ...answer, clone: () => answer };
  }),
);
