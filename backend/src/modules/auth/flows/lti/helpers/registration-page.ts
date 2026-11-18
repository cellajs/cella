import type { Context } from 'hono';
import { html } from 'hono/html';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Env } from '#/core/context';
import { anyFrameAncestor, protocolPage } from '#/lib/protocol-page';

/** Tells the platform the registration ended, in its frame or in the window it opened. */
const closeScript =
  "const message = { subject: 'org.imsglobal.lti.close' }; window.parent.postMessage(message, '*'); if (window.opener) window.opener.postMessage(message, '*');";

/**
 * The page a registration ends on: one line of text and the close message. A platform frames it from an origin not
 * known in advance. The opener policy lets a platform's window hear the close message. The page holds no session.
 */
export const registrationPage = (ctx: Context<Env>, text: string, status: ContentfulStatusCode) => {
  ctx.header('Cross-Origin-Opener-Policy', 'unsafe-none');
  return protocolPage(ctx, { body: html`<p>${text}</p>`, script: closeScript, frameAncestors: anyFrameAncestor, status });
};
