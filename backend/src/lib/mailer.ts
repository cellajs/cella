import { randomBytes } from 'node:crypto';
import { appConfig } from 'shared';
import { env } from '#/env';
import { currentRequestDetails } from '#/lib/request-details';
import { ambientRequest, log } from '#/utils/logger';
import { sanitizeEmailSubject } from '#/utils/sanitize-email-subject';
import { type SafeHtmlPolicy, sanitizeEmailHtml } from '../../emails/components/safe-html';
import { emailFrame } from '../../emails/frame';
import { render } from '../../emails/renderer/render';
import { brevoPlaceholder, type EmailRecipient, type EmailTemplateDef } from '../../emails/types';

if (!env.BREVO_API_KEY && appConfig.mode !== 'test') log.info('Email sending disabled: BREVO_API_KEY missing');

const maxVersionsPerCall = 99;

const brevoSendUrl = 'https://api.brevo.com/v3/smtp/email';
const brevoTimeoutMs = 60_000;
const brevoMaxRetries = 2;

/** A Brevo tag opener (`{{`, `{%`, `{#`), or a placeholder `{{params.key}}` (groups: the key, a `|safe`). */
const brevoTagOpener = /\{\{params\.([A-Za-z0-9_]+)(\|safe)?\}\}|\{(?=[{%#])/g;

interface BrevoPlaceholders {
  /** Keys every message version carries: `{{params.<key>}}` stays, and Brevo fills it escaped. */
  params: readonly string[];
  /** Declared HTML params: `{{params.<key>|safe}}` stays, and Brevo prints the value as it is. */
  htmlParams?: readonly string[];
}

/**
 * Brevo renders `subject` and `htmlContent` as templates and HTML-escapes every `params` value by default. Text
 * rendered here (a name, a title, a message) must never open a tag of its own: it could print a param unescaped
 * (`|safe`), switch escaping off, hide the rest of the mail or break the send. Every opener except the mailer's own
 * placeholders loses its first brace to a character reference, or in plain text to a brace plus a zero-width space,
 * so the text still reads as typed.
 * @param content - Rendered HTML, a plain-text subject or an HTML param's value.
 * @param placeholders - The placeholders the mailer put there itself.
 * @param format - `html` for the body and HTML params, `text` for the subject.
 */
export function neutralizeBrevoTags(content: string, { params, htmlParams = [] }: BrevoPlaceholders, format: 'html' | 'text'): string {
  const brace = format === 'html' ? '&#123;' : '{\u200B';
  return content.replace(brevoTagOpener, (match, key: string | undefined, safe: string | undefined) => {
    const ownPlaceholder = key !== undefined && (safe ? htmlParams.includes(key) : params.includes(key));
    return ownPlaceholder ? match : `${brace}${match.slice(1)}`;
  });
}

/**
 * Brevo prints a declared HTML param as it is, so its value goes out sanitized by its `SafeHtml` policy, the one a
 * local render would apply, and with no tag opener left in it: pongo2 never parses a printed value, and nothing here
 * depends on that.
 */
function withSafeHtmlParams(params: Record<string, unknown>, htmlParams: Partial<Record<string, SafeHtmlPolicy>>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => {
      const policy = htmlParams[key];
      if (!policy) return [key, value];
      return [key, neutralizeBrevoTags(sanitizeEmailHtml(String(value ?? ''), policy), { params: [] }, 'html')];
    }),
  );
}

/** Posts to Brevo's transactional endpoint, retrying 408, 429 and 5xx with backoff (Retry-After wins). */
async function postToBrevo(apiKey: string, body: unknown): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(brevoSendUrl, {
      method: 'POST',
      headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(brevoTimeoutMs),
    });
    if (res.ok) return;

    const retryable = res.status === 408 || res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= brevoMaxRetries) {
      throw new Error(`Brevo responded ${res.status}: ${await res.text().catch(() => '')}`);
    }
    const retryAfterSeconds = Number.parseInt(res.headers.get('retry-after') ?? '', 10);
    const delayMs = retryAfterSeconds > 0 ? Math.min(retryAfterSeconds * 1000, 60_000) : 1000 * 2 ** attempt;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

interface Batch {
  subject: string;
  html: string;
  versions: { to: { email: string }[]; params: Record<string, unknown> }[];
  replyTo: string | undefined;
  /** The rendered template's declared HTML params (`HtmlParams`), keyed as the versions' params are. */
  htmlParams: Partial<Record<string, SafeHtmlPolicy>>;
  /** The request the send runs in, as an `X-Request-Id` header: "show original" leads support to its log lines. */
  requestId: string | undefined;
}

/**
 * Sends one batch of message versions through Brevo. Sends nothing without a Brevo key, or in test mode unless
 * `TEST_SEND_EMAILS` is set; a failed send is logged, never thrown.
 */
async function sendBatch({ subject, html, versions, replyTo, htmlParams, requestId }: Batch): Promise<void> {
  if (!env.BREVO_API_KEY) return;
  if (appConfig.mode === 'test' && !env.TEST_SEND_EMAILS) return;

  const params = Object.keys(versions[0]?.params ?? {});
  const placeholders = { params, htmlParams: Object.keys(htmlParams).filter((key) => htmlParams[key]) };
  try {
    await postToBrevo(env.BREVO_API_KEY, {
      subject: neutralizeBrevoTags(sanitizeEmailSubject(subject || `${appConfig.name} message`), { params }, 'text'),
      htmlContent: neutralizeBrevoTags(html, placeholders, 'html'),
      sender: { email: appConfig.senderEmail },
      replyTo: { email: replyTo || appConfig.supportEmail },
      ...(requestId ? { headers: { 'X-Request-Id': requestId } } : {}),
      messageVersions: versions.map((version) => ({ ...version, params: withSafeHtmlParams(version.params, htmlParams) })),
    });
  } catch (err) {
    log.warn('Failed to send email batch', { err });
  }
}

/** Sends the app's mail through Brevo's transactional API. */
export const mailer = {
  /**
   * Renders once per language group with Brevo placeholders (`brevoPlaceholder`) whose keys carry a nonce drawn for the
   * send, then sends in batches of `maxVersionsPerCall`.
   */
  async sendEmails<TStatic, TRecipient extends EmailRecipient>(
    template: EmailTemplateDef<TStatic, TRecipient>,
    staticProps: TStatic,
    recipients: TRecipient[],
    replyTo?: string,
  ): Promise<void> {
    if (!recipients.length) return;

    const details = template.requestDetails ? await currentRequestDetails() : null;
    const requestId = ambientRequest()?.var.requestId;

    for (const [lng, lngRecipients] of Map.groupBy(recipients, (recipient) => recipient.lng)) {
      // Every param key carries a nonce drawn for this send, so text a user typed into the mail can never name one:
      // only the mailer's own placeholders survive `neutralizeBrevoTags`.
      const nonce = randomBytes(8).toString('hex');
      const paramKey = (key: string) => `${key}_${nonce}`;
      const htmlParams: Partial<Record<string, SafeHtmlPolicy>> = {};
      for (const [key, policy] of Object.entries<SafeHtmlPolicy | undefined>(template.htmlParams ?? {})) htmlParams[paramKey(key)] = policy;

      const { subject, ...componentProps } = template.translate(lng, staticProps, (key) => brevoPlaceholder(paramKey(String(key)), htmlParams));

      const recipientKeys = Object.keys(lngRecipients[0]).filter((key) => key !== 'email' && key !== 'lng');
      const placeholderProps: Record<string, string> = {};
      for (const key of recipientKeys) placeholderProps[key] = brevoPlaceholder(paramKey(key), htmlParams);

      const frame = emailFrame(template, staticProps, lng, details);
      const html = await render(template.component({ ...componentProps, ...placeholderProps, frame }));

      for (let i = 0; i < lngRecipients.length; i += maxVersionsPerCall) {
        const batch = lngRecipients.slice(i, i + maxVersionsPerCall);

        const versions = batch.map((recipient) => {
          const params: Record<string, unknown> = {};
          for (const key of recipientKeys) params[paramKey(key)] = (recipient as Record<string, unknown>)[key];
          // The recipient's address, which a template names through `param('email')`
          params[paramKey('email')] = recipient.email;
          return { to: [{ email: env.SEND_ALL_TO_EMAIL || recipient.email }], params };
        });

        await sendBatch({ subject, html, versions, replyTo, htmlParams, requestId });
      }
    }
  },
};
