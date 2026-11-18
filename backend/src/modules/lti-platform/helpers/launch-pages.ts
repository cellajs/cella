import { createHash } from 'node:crypto';
import type { Context } from 'hono';
import { html, raw } from 'hono/html';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';

const submitScript = 'document.forms[0].submit();';

const submitScriptHash = createHash('sha256').update(submitScript).digest('base64');

/**
 * The headers of a launch page. The app's own pages frame it, and the frame host shares the issuer's origin. It sends
 * no referrer: its address may hold a launch record.
 */
const launchPageHeaders = (ctx: Context<Env>, csp: string) => {
  ctx.header('Content-Security-Policy', `default-src 'none'; base-uri 'none'; frame-ancestors 'self'; ${csp}`);
  ctx.header('Referrer-Policy', 'no-referrer');
  ctx.header('Cache-Control', 'no-store');
};

/**
 * A page that posts `fields` to `action` as it loads: the login initiation to an LTI tool, or an ID token to its launch
 * address. Its CSP admits the inline script by hash and form posts to the given origins alone; a redirect after the post
 * must stay on them too.
 */
export const autoPostPage = (
  ctx: Context<Env>,
  { action, fields, formOrigins }: { action: string; fields: Record<string, string>; formOrigins: string[] },
) => {
  launchPageHeaders(ctx, `script-src 'sha256-${submitScriptHash}'; form-action ${formOrigins.join(' ')}`);
  return ctx.html(
    html`<!DOCTYPE html>
<html lang="${appConfig.defaultLanguageCode}">
  <head>
    <meta charset="utf-8" />
    <title>${appConfig.name}</title>
  </head>
  <body>
    <form method="post" action="${action}">
      ${Object.entries(fields).map(([name, value]) => html`<input type="hidden" name="${name}" value="${value}" />`)}
    </form>
    <script>${raw(submitScript)}</script>
  </body>
</html>`,
  );
};

/** A launch refused where no address of the LTI tool may hear it: one line of text in the frame. */
export const launchRefusalPage = (ctx: Context<Env>, text: string, status: ContentfulStatusCode) => {
  launchPageHeaders(ctx, "form-action 'none'");
  return ctx.html(
    html`<!DOCTYPE html>
<html lang="${appConfig.defaultLanguageCode}">
  <head>
    <meta charset="utf-8" />
    <title>${appConfig.name}</title>
  </head>
  <body>
    <p>${text}</p>
  </body>
</html>`,
    status,
  );
};
