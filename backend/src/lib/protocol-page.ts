import { createHash } from 'node:crypto';
import type { Context } from 'hono';
import { html, raw } from 'hono/html';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { toClientError } from '#/lib/error';

/** Any HTTPS page, plain HTTP ones too in development and test: who may frame a page that holds nothing but text. */
export const anyFrameAncestor = appConfig.mode === 'development' || appConfig.mode === 'test' ? 'https: http:' : 'https:';

// The page's one style, admitted by its hash: in a launch frame it reads as text of the app around it, not as a bare document.
const pageStyle = 'body{font:14px/1.5 system-ui,sans-serif;margin:1.5rem}h1{font-size:1.125rem;font-weight:600;margin:0 0 .5rem}';
const pageStyleSrc = `'sha256-${createHash('sha256').update(pageStyle).digest('base64')}'`;

interface ProtocolPageOpts {
  body: ReturnType<typeof html>;
  /** The page's one inline script, admitted by its hash; none on a page of text. */
  script?: string;
  /** Who may frame the page: a `frame-ancestors` source list. */
  frameAncestors: string;
  /** Where its form may post, a redirect after the post included: a `form-action` source list. */
  formAction?: string;
  status?: ContentfulStatusCode;
}

/**
 * A page a protocol step answers a browser with, outside the frontend: an LTI registration's end, a launch's login and
 * launch pages, a refusal. Its CSP admits nothing but its one style, its one inline script and the framing and form
 * posts it names; it sends no referrer, as its address may hold a hint or a launch record, and is never stored. With its
 * own `frame-ancestors` it sends no X-Frame-Options (`app.ts`).
 */
export const protocolPage = (ctx: Context<Env>, { body, script, frameAncestors, formAction = "'none'", status = 200 }: ProtocolPageOpts) => {
  const scriptSrc = script ? `'sha256-${createHash('sha256').update(script).digest('base64')}'` : "'none'";
  ctx.header(
    'Content-Security-Policy',
    `default-src 'none'; script-src ${scriptSrc}; style-src ${pageStyleSrc}; base-uri 'none'; form-action ${formAction}; frame-ancestors ${frameAncestors}`,
  );
  ctx.header('Referrer-Policy', 'no-referrer');
  ctx.header('Cache-Control', 'no-store');
  return ctx.html(
    html`<!DOCTYPE html>
<html lang="${appConfig.defaultLanguageCode}">
  <head>
    <meta charset="utf-8" />
    <title>${appConfig.name}</title>
    <style>${raw(pageStyle)}</style>
  </head>
  <body>
    ${body}
    ${script ? html`<script>${raw(script)}</script>` : ''}
  </body>
</html>`,
    status,
  );
};

/** A refused protocol step: the error's translated title and text, on a page with no script and no form. */
export const refusalPage = (ctx: Context<Env>, err: unknown, frameAncestors: string) => {
  const refusal = toClientError(err, { path: ctx.req.path, method: ctx.req.method }, { exposeServerMessage: false });
  return protocolPage(ctx, { body: html`<h1>${refusal.title}</h1><p>${refusal.detail}</p>`, frameAncestors, status: refusal.status });
};
