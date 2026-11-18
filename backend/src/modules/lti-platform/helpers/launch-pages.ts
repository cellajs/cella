import type { Context } from 'hono';
import { html } from 'hono/html';
import type { Env } from '#/core/context';
import { protocolPage, refusalPage } from '#/lib/protocol-page';

const submitScript = 'document.forms[0].submit();';

/** The app's own pages frame a launch page: the frame host shares the issuer's origin. */
const launchFrameAncestors = "'self'";

/**
 * A page that posts `fields` to `action` as it loads: the login initiation to an LTI tool, or an ID token to its launch
 * address. Its form posts, and a redirect after one, go to `formOrigins` alone.
 */
export const autoPostPage = (
  ctx: Context<Env>,
  { action, fields, formOrigins }: { action: string; fields: Record<string, string>; formOrigins: string[] },
) => {
  const body = html`<form method="post" action="${action}">
      ${Object.entries(fields).map(([name, value]) => html`<input type="hidden" name="${name}" value="${value}" />`)}
    </form>`;
  return protocolPage(ctx, { body, script: submitScript, frameAncestors: launchFrameAncestors, formAction: formOrigins.join(' ') });
};

/** A launch refused where no address of the LTI tool may hear it: the error's title and text in the frame. */
export const launchRefusalPage = (ctx: Context<Env>, err: unknown) => refusalPage(ctx, err, launchFrameAncestors);
