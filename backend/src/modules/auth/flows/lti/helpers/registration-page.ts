import { createHash } from 'node:crypto';
import type { Context } from 'hono';
import { html, raw } from 'hono/html';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { anyFrameAncestor } from '#/modules/auth/flows/lti/helpers/platform-storage-pages';

/** Tells the platform the registration ended, in its frame or in the window it opened. */
const closeScript =
  "const message = { subject: 'org.imsglobal.lti.close' }; window.parent.postMessage(message, '*'); if (window.opener) window.opener.postMessage(message, '*');";

const closeScriptHash = createHash('sha256').update(closeScript).digest('base64');

/**
 * The page a registration ends on: one line of text and the close message. A platform frames it from an origin not
 * known in advance: any HTTPS ancestor may, plain HTTP too in development and test. With its own `frame-ancestors`
 * it sends no X-Frame-Options (`app.ts`). The opener policy lets a platform's window hear the close message. The page
 * holds no session.
 */
export const registrationPage = (ctx: Context<Env>, text: string, status: ContentfulStatusCode) => {
  ctx.header(
    'Content-Security-Policy',
    `default-src 'none'; script-src 'sha256-${closeScriptHash}'; base-uri 'none'; form-action 'none'; frame-ancestors ${anyFrameAncestor}`,
  );
  ctx.header('Cross-Origin-Opener-Policy', 'unsafe-none');
  ctx.header('Cache-Control', 'no-store');
  return ctx.html(
    html`<!DOCTYPE html>
<html lang="${appConfig.defaultLanguageCode}">
  <head>
    <meta charset="utf-8" />
    <title>${appConfig.name}</title>
  </head>
  <body>
    <p>${text}</p>
    <script>${raw(closeScript)}</script>
  </body>
</html>`,
    status,
  );
};
