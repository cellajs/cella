import type { Context } from 'hono';
import { html } from 'hono/html';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { i18n } from '#/lib/i18n';
import { anyFrameAncestor, protocolPage, refusalPage } from '#/lib/protocol-page';

/** Where the launch page posts the launch and the stored value, same-origin. */
const ltiFinishUrl = () => `${appConfig.backendAuthUrl}/lti/finish`;

/**
 * Where a login keeps its value and a launch reads it back: the frame's own `sessionStorage` first, then platform
 * storage (1EdTech LTI postMessage Storage, draft 0.1, with the OIDC login profile), one `lti.put_data` or
 * `lti.get_data` to the frame `lti_storage_target` names, at the origin of the platform's authorization endpoint,
 * which alone may answer.
 */
export interface StorageExchange {
  subject: 'lti.put_data' | 'lti.get_data';
  /** `_parent`, or the name of a frame of the parent; absent when the platform named none. */
  target?: string;
  /** The origin of the platform's authorization endpoint: the message goes there, and only an answer from there counts. */
  origin: string;
  /** The origin of the platform's own pages its connection recorded, when it did: Canvas frames the LTI tool there. */
  pageOrigin?: string;
  key: string;
  /** The value to put; absent for a get. */
  value?: string;
  /** For a put: where the browser goes once the platform stored the value. */
  next?: string;
  /** For a get: the fields the page posts to `ltiFinishUrl` with the value it read back, as `storage_value`. */
  fields?: Record<string, string>;
}

/**
 * Outside a frame it shows the unframed text and does nothing else. In a frame it keeps or reads the value in the
 * frame's own `sessionStorage` first: a put holds once it reads back, and a get takes the value out. Where that keeps
 * nothing, it sends the platform storage message and waits for its `.response` from the platform's origin with the
 * same `message_id`. A put then moves on to `next`; a get posts the form with the value. No frame to ask, an error
 * answer, a wrong key or no answer within ten seconds shows the refusal text.
 */
const storageScript = `const output = document.getElementById('status');
const data = JSON.parse(output.dataset.exchange);
const put = data.value !== undefined;
const refuse = () => { output.textContent = data.refusal; };
const proceed = (value) => {
  if (put) return window.location.replace(data.next);
  document.forms[0].elements.storage_value.value = value;
  document.forms[0].submit();
};
const ownStorage = () => {
  try {
    if (put) {
      sessionStorage.setItem(data.key, data.value);
      return sessionStorage.getItem(data.key) === data.value ? data.value : null;
    }
    const value = sessionStorage.getItem(data.key);
    sessionStorage.removeItem(data.key);
    return value;
  } catch {
    return null;
  }
};
const targetFrame = () => {
  try {
    return data.target === '_parent' ? window.parent : data.target && window.parent.frames[data.target];
  } catch {
    return undefined;
  }
};
const platformStorage = () => {
  const frame = targetFrame();
  if (!frame || frame === window) return refuse();
  const messageId = crypto.randomUUID();
  const timer = setTimeout(refuse, 10000);
  window.addEventListener('message', (event) => {
    const reply = event.data;
    if (event.origin !== data.origin || !reply || reply.subject !== data.subject + '.response' || reply.message_id !== messageId) return;
    clearTimeout(timer);
    if (reply.error || reply.key !== data.key || (!put && typeof reply.value !== 'string')) return refuse();
    proceed(reply.value);
  });
  const message = { subject: data.subject, message_id: messageId, key: data.key };
  if (put) message.value = data.value;
  frame.postMessage(message, data.origin);
};
if (window.parent === window) output.textContent = data.unframed;
else {
  const held = ownStorage();
  if (held) proceed(held);
  else platformStorage();
}`;

/**
 * The login page, which keeps the nonce's value, or the launch page, which reads it back (`storageScript`). Only the
 * connection's own platform may frame it, from its authorization origin and its page origin: a page another
 * connection's platform frames from could otherwise run this platform's launch inside itself.
 */
export const storagePage = (ctx: Context<Env>, exchange: StorageExchange) => {
  const data = JSON.stringify({
    ...exchange,
    fields: undefined,
    pageOrigin: undefined,
    refusal: i18n.t('backend:lti.state_not_kept'),
    unframed: i18n.t('backend:lti.not_framed'),
  });
  const form = exchange.fields
    ? html`<form method="post" action="${ltiFinishUrl()}">
      ${Object.entries(exchange.fields).map(([name, value]) => html`<input type="hidden" name="${name}" value="${value}" />`)}
      <input type="hidden" name="storage_value" value="" />
    </form>`
    : '';
  const body = html`<p id="status" data-exchange="${data}"></p>
    ${form}`;
  const frameAncestors = exchange.pageOrigin ? `${exchange.origin} ${exchange.pageOrigin}` : exchange.origin;
  return protocolPage(ctx, { body, script: storageScript, frameAncestors, formAction: "'self'" });
};

/**
 * A refused launch step: the error's translated title and text. Any platform may frame it, one the app no longer knows
 * too: it holds no script, form or session, and an unknown issuer would get the same page anywhere.
 */
export const launchStepRefusalPage = (ctx: Context<Env>, err: unknown) => refusalPage(ctx, err, anyFrameAncestor);
