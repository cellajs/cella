import type { Context } from 'hono';
import { html } from 'hono/html';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Env } from '#/core/context';
import { i18n } from '#/lib/i18n';
import { anyFrameAncestor, protocolPage, refusalOf } from '#/lib/protocol-page';

/** Tells the platform the registration ended, in its frame or in the window it opened (LTI Dynamic Registration 1.0, section 3.7). */
const closeScript =
  "const message = { subject: 'org.imsglobal.lti.close' }; window.parent.postMessage(message, '*'); if (window.opener) window.opener.postMessage(message, '*');";

/** The close message waits for the person, who reads the refusal first. */
const closeOnClickScript = `document.getElementById('close').addEventListener('click', () => { ${closeScript} });`;

/**
 * A page a registration ends on. A platform frames it from an origin not known in advance. The opener policy lets a
 * platform's window hear the close message. The page holds no session.
 */
const registrationEndPage = (ctx: Context<Env>, body: ReturnType<typeof html>, script: string, status: ContentfulStatusCode) => {
  ctx.header('Cross-Origin-Opener-Policy', 'unsafe-none');
  return protocolPage(ctx, { body, script, frameAncestors: anyFrameAncestor, status });
};

/** A registration that went through: one line of text, and the close message as the page loads. */
export const registeredPage = (ctx: Context<Env>) => registrationEndPage(ctx, html`<p>${i18n.t('backend:lti.registered')}</p>`, closeScript, 200);

/** A refused registration: why, and a button that sends the close message. The platform keeps the page until the person closes it. */
export const registrationRefusalPage = (ctx: Context<Env>, err: unknown) => {
  const { title, text, status } = refusalOf(ctx, err);
  const body = html`<h1>${title}</h1>
    <p>${text}</p>
    <button type="button" id="close">${i18n.t('c:close')}</button>`;
  return registrationEndPage(ctx, body, closeOnClickScript, status);
};
