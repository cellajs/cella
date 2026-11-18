import type { Context } from 'hono';
import { html } from 'hono/html';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { i18n } from '#/lib/i18n';
import { anyFrameAncestor, protocolPage, refusalPage } from '#/lib/protocol-page';

/** Where the launch page posts the launch and the stored value, same-origin. */
const ltiFinishUrl = () => `${appConfig.backendAuthUrl}/lti/finish`;

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
const storageScript = `const output = document.getElementById('status');
const data = JSON.parse(output.dataset.exchange);
const refuse = () => { output.textContent = data.refusal; };
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

/**
 * The login page, which puts the nonce's value into platform storage, or the launch page, which reads it back. Only the
 * platform's own origin may frame it.
 */
export const storagePage = (ctx: Context<Env>, exchange: StorageExchange) => {
  const data = JSON.stringify({ ...exchange, fields: undefined, refusal: i18n.t('backend:lti.storage_unanswered') });
  const form = exchange.fields
    ? html`<form method="post" action="${ltiFinishUrl()}">
      ${Object.entries(exchange.fields).map(([name, value]) => html`<input type="hidden" name="${name}" value="${value}" />`)}
      <input type="hidden" name="storage_value" value="" />
    </form>`
    : '';
  const body = html`<p id="status" data-exchange="${data}"></p>
    ${form}`;
  return protocolPage(ctx, { body, script: storageScript, frameAncestors: exchange.origin, formAction: "'self'" });
};

/**
 * A refused launch step: the error's translated title and text. Any platform may frame it, one the app no longer knows
 * too: it holds no script, form or session, and an unknown issuer would get the same page anywhere.
 */
export const launchStepRefusalPage = (ctx: Context<Env>, err: unknown) => refusalPage(ctx, err, anyFrameAncestor);
