import { Hono } from 'hono';
import { hierarchy } from 'shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '#/core/context';
import { mailer } from '#/lib/mailer';
import { runWithLogContext } from '#/utils/logger';
import { magicLinkEmail } from '../../emails/templates/magic-link';
import { memberInviteEmail } from '../../emails/templates/member-invite';

type SentBody = { htmlContent: string; headers?: Record<string, string> };

const requestId = 'f1c2d3e4-0000-4000-8000-000000000001';
const firefoxOnMac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:131.0) Gecko/20100101 Firefox/131.0';

/** Runs `send` the way a route handler does: inside a request, which the log context middleware makes ambient. */
const inRequest = async (send: () => Promise<void>) => {
  const app = new Hono<Env>();
  app.use('*', (ctx, next) => runWithLogContext(ctx, () => next()));
  app.get('/', async (ctx) => {
    ctx.set('requestId', requestId);
    await send();
    return ctx.body(null, 204);
  });
  await app.request('/', { headers: { 'user-agent': firefoxOnMac, 'x-forwarded-for': '203.0.113.7' } });
};

/** Every Brevo request body the sends below post. */
const captureSends = () => {
  const bodies: SentBody[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(null, { status: 201 });
    }),
  );
  // Under Vitest `env` reads process.env directly.
  process.env.BREVO_API_KEY = 'test-brevo-key';
  process.env.TEST_SEND_EMAILS = 'true';
  return bodies;
};

afterEach(() => {
  delete process.env.BREVO_API_KEY;
  delete process.env.TEST_SEND_EMAILS;
  vi.unstubAllGlobals();
});

const sendMagicLink = () =>
  mailer.sendEmails(magicLinkEmail, { magicLinkUrl: 'https://app.example.test/magic', name: 'Emily', isNewUser: false }, [
    { email: 'emily@example.test', lng: 'en' },
  ]);

const sendInvite = () =>
  mailer.sendEmails(memberInviteEmail, { senderName: 'John', entityName: 'Acme', role: hierarchy.getLeastPrivilegedRole('organization') }, [
    { email: 'emily@example.test', lng: 'en', name: 'Emily', memberInviteLink: 'https://app.example.test/acme' },
  ]);

describe('request details in mail', () => {
  it('show where a request came from only in mail about something done as the recipient', async () => {
    const bodies = captureSends();

    await inRequest(async () => {
      await sendMagicLink();
      await sendInvite();
    });
    await sendMagicLink();

    const [magicInRequest, inviteInRequest, magicOutside] = bodies;

    expect(magicInRequest.htmlContent).toContain('class="request-details"');
    expect(magicInRequest.htmlContent).toContain('Firefox on macOS');
    expect(magicInRequest.headers).toEqual({ 'X-Request-Id': requestId });

    // The inviter's request: their whereabouts never reach the invited address.
    expect(inviteInRequest.htmlContent).not.toContain('request-details');
    expect(inviteInRequest.htmlContent).not.toContain('Firefox');

    expect(magicOutside.htmlContent).not.toContain('request-details');
    expect(magicOutside.headers).toBeUndefined();
  });
});
