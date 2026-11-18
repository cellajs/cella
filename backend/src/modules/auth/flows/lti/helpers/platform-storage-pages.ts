import { createHash } from 'node:crypto';
import type { Context } from 'hono';
import { html, raw } from 'hono/html';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { toClientError } from '#/lib/error';
import { i18n } from '#/lib/i18n';

/** Where the launch page posts the launch and the stored value, same-origin. */
const ltiFinishUrl = () => `${appConfig.backendAuthUrl}/lti/finish`;

/**
 * Who may frame a page of a launch: the origin of the connection's authorization endpoint once the connection is known,
 * and nobody before. A step sets it as soon as it found the connection: its refusal page then shows in the platform's
 * frame.
 */
export interface PageFrame {
  ancestor: string | null;
}

/**
 * A platform storage exchange (1EdTech LTI postMessage Storage, draft 0.1, with the OIDC login profile): one
 * `lti.put_data` or `lti.get_data` to the frame `lti_storage_target` names, at the origin of the platform's
 * authorization endpoint, which alone may answer.
 */
export interface StorageExchange {
  subject: 'lti.put_data' | 'lti.get_data';
  /** `_parent`, or the name of a frame of the parent. */
  target: string;
  /** The origin of the platform's authorization endpoint: the message goes there, and only an answer from there counts. */
  origin: string;
  key: string;
  /** The value to put; absent for a get. */
  value?: string;
  /** For a put: where the browser goes once the platform stored the value. */
  next?: string;
  /** For a get: the fields the page posts to `ltiFinishUrl` with the value it read back, as `storage_value`. */
  fields?: Record<string, string>;
}

/**
 * Sends the exchange's message and waits for its `.response` from the platform's origin with the same `message_id`.
 * A put moves on to `next`; a get posts the form with the value. An error answer, a wrong key, no frame or no answer
 * within ten seconds shows the refusal text.
 */
const storageScript = `const data = JSON.parse(document.body.dataset.exchange);
const refuse = () => { document.getElementById('status').textContent = data.refusal; };
const frame = data.target === '_parent' ? window.parent : window.parent.frames[data.target];
const messageId = crypto.randomUUID();
const timer = setTimeout(refuse, 10000);
window.addEventListener('message', (event) => {
  const reply = event.data;
  if (event.origin !== data.origin || !reply || reply.subject !== data.subject + '.response' || reply.message_id !== messageId) return;
  clearTimeout(timer);
  if (reply.error || reply.key !== data.key) return refuse();
  if (data.next) return window.location.replace(data.next);
  if (typeof reply.value !== 'string') return refuse();
  document.forms[0].elements.storage_value.value = reply.value;
  document.forms[0].submit();
});
const message = { subject: data.subject, message_id: messageId, key: data.key };
if (data.value !== undefined) message.value = data.value;
if (frame && frame !== window) frame.postMessage(message, data.origin);
else refuse();`;

const storageScriptHash = createHash('sha256').update(storageScript).digest('base64');

/** The headers of a launch page: framed by the platform alone, no referrer (its address may carry hints), never stored. */
const pageHeaders = (ctx: Context<Env>, frame: PageFrame, scriptSrc: string) => {
  const ancestors = frame.ancestor ?? "'none'";
  ctx.header(
    'Content-Security-Policy',
    `default-src 'none'; script-src ${scriptSrc}; base-uri 'none'; form-action 'self'; frame-ancestors ${ancestors}`,
  );
  ctx.header('Referrer-Policy', 'no-referrer');
  ctx.header('Cache-Control', 'no-store');
};

/** The login page, which puts the nonce's value into platform storage, or the launch page, which reads it back. */
export const storagePage = (ctx: Context<Env>, frame: PageFrame, exchange: StorageExchange) => {
  pageHeaders(ctx, frame, `'sha256-${storageScriptHash}'`);
  const data = JSON.stringify({ ...exchange, fields: undefined, refusal: i18n.t('backend:lti.storage_unanswered') });
  return ctx.html(
    html`<!DOCTYPE html>
<html lang="${appConfig.defaultLanguageCode}">
  <head>
    <meta charset="utf-8" />
    <title>${appConfig.name}</title>
  </head>
  <body data-exchange="${data}">
    <p id="status"></p>
    ${
      exchange.fields
        ? html`<form method="post" action="${ltiFinishUrl()}">
      ${Object.entries(exchange.fields).map(([name, value]) => html`<input type="hidden" name="${name}" value="${value}" />`)}
      <input type="hidden" name="storage_value" value="" />
    </form>`
        : ''
    }
    <script>${raw(storageScript)}</script>
  </body>
</html>`,
  );
};

/** A refused launch step: the error's translated title and text, framed by the platform when it is known. */
export const refusalPage = (ctx: Context<Env>, frame: PageFrame, err: unknown) => {
  const refusal = toClientError(err, { path: ctx.req.path, method: ctx.req.method }, { exposeServerMessage: false });
  pageHeaders(ctx, frame, "'none'");
  const status: ContentfulStatusCode = refusal.status;
  return ctx.html(
    html`<!DOCTYPE html>
<html lang="${appConfig.defaultLanguageCode}">
  <head>
    <meta charset="utf-8" />
    <title>${appConfig.name}</title>
  </head>
  <body>
    <h1>${refusal.title}</h1>
    <p>${refusal.detail}</p>
  </body>
</html>`,
    status,
  );
};
