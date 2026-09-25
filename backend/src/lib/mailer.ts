import { appConfig } from 'shared';
import { env } from '#/env';
import { log } from '#/utils/logger';
import { sanitizeEmailSubject } from '#/utils/sanitize-email-subject';
import { type SafeHtmlPolicy, sanitizeEmailHtml } from '../../emails/components/safe-html';
import { render } from '../../emails/renderer/render';
import { brevoPlaceholder, type EmailRecipient, type EmailTemplateDef } from '../../emails/types';

if (!env.BREVO_API_KEY && appConfig.mode !== 'test') log.info('Email sending disabled: BREVO_API_KEY missing');

const MAX_VERSIONS_PER_CALL = 99;

const BREVO_SEND_URL = 'https://api.brevo.com/v3/smtp/email';
const BREVO_TIMEOUT_MS = 60_000;
const BREVO_MAX_RETRIES = 2;

/** A Brevo tag opener (`{{`, `{%`, `{#`), or a placeholder `{{params.key}}` (groups: the key, a `|safe`). */
const BREVO_TAG_OPENER = /\{\{params\.([A-Za-z0-9_]+)(\|safe)?\}\}|\{(?=[{%#])/g;

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
export function neutralizeBrevoTags(
  content: string,
  { params, htmlParams = [] }: BrevoPlaceholders,
  format: 'html' | 'text',
): string {
  const brace = format === 'html' ? '&#123;' : '{\u200B';
  return content.replace(BREVO_TAG_OPENER, (match, key: string | undefined, safe: string | undefined) => {
    const ownPlaceholder = key !== undefined && (safe ? htmlParams.includes(key) : params.includes(key));
    return ownPlaceholder ? match : `${brace}${match.slice(1)}`;
  });
}

/**
 * Brevo prints a declared HTML param as it is, so its value goes out sanitized by its `SafeHtml` policy, the one a
 * local render would apply, and with no tag opener left in it: pongo2 never parses a printed value, and nothing here
 * depends on that.
 */
const withSafeHtmlParams = (
  params: Record<string, unknown>,
  htmlParams: Partial<Record<string, SafeHtmlPolicy>>,
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(params).map(([key, value]) => {
      const policy = htmlParams[key];
      if (!policy) return [key, value];
      return [key, neutralizeBrevoTags(sanitizeEmailHtml(String(value ?? ''), policy), { params: [] }, 'html')];
    }),
  );

/** Posts to Brevo's transactional endpoint, retrying 408, 429 and 5xx with backoff (Retry-After wins), as its SDK did. */
async function postToBrevo(apiKey: string, body: unknown): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(BREVO_SEND_URL, {
      method: 'POST',
      headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(BREVO_TIMEOUT_MS),
    });
    if (res.ok) return;

    const retryable = res.status === 408 || res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= BREVO_MAX_RETRIES) {
      throw new Error(`Brevo responded ${res.status}: ${await res.text().catch(() => '')}`);
    }
    const retryAfterSeconds = Number.parseInt(res.headers.get('retry-after') ?? '', 10);
    const delayMs = retryAfterSeconds > 0 ? Math.min(retryAfterSeconds * 1000, 60_000) : 1000 * 2 ** attempt;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

type Mailer = {
  prepareEmails<TStatic, TRecipient extends EmailRecipient>(
    template: EmailTemplateDef<TStatic, TRecipient>,
    staticProps: TStatic,
    recipients: TRecipient[],
    replyTo?: string,
  ): Promise<void>;

  sendBatch(
    subject: string,
    html: string,
    versions: { to: { email: string }[]; params: Record<string, unknown> }[],
    replyTo?: string,
    /** The rendered template's declared HTML params (`HtmlParams`). */
    htmlParams?: Partial<Record<string, SafeHtmlPolicy>>,
  ): Promise<void>;
};

export const mailer: Mailer = {
  /** Renders once per language group with Brevo placeholders (`brevoPlaceholder`), then sends in batches of 99. */
  async prepareEmails<TStatic, TRecipient extends EmailRecipient>(
    template: EmailTemplateDef<TStatic, TRecipient>,
    staticProps: TStatic,
    recipients: TRecipient[],
    replyTo?: string,
  ) {
    if (!recipients.length) return;

    const byLng = new Map<string, TRecipient[]>();
    for (const r of recipients) {
      const group = byLng.get(r.lng) ?? [];
      group.push(r);
      byLng.set(r.lng, group);
    }

    const htmlParams: Partial<Record<string, SafeHtmlPolicy>> = { ...template.htmlParams };

    for (const [lng, lngRecipients] of byLng) {
      // Translate once per language
      const translated = template.translate(lng, staticProps);
      const { subject, ...componentProps } = translated;

      // Determine per-recipient keys (everything beyond email/lng)
      const recipientKeys = Object.keys(lngRecipients[0]).filter((k) => k !== 'email' && k !== 'lng');

      // Build placeholder values for rendering: { name: '{{params.name}}', inviteLink: '{{params.inviteLink}}' }
      const placeholderProps: Record<string, string> = {};
      for (const k of recipientKeys) {
        placeholderProps[k] = brevoPlaceholder(k, htmlParams);
      }

      const html = await render(template.component({ ...componentProps, ...placeholderProps }));

      for (let i = 0; i < lngRecipients.length; i += MAX_VERSIONS_PER_CALL) {
        const batch = lngRecipients.slice(i, i + MAX_VERSIONS_PER_CALL);

        const versions = batch.map((recipient) => {
          const params: Record<string, unknown> = {};
          for (const k of recipientKeys) {
            params[k] = (recipient as Record<string, unknown>)[k];
          }
          // Include email in params so templates can reference {{params.email}}
          params.email = recipient.email;
          return { to: [{ email: env.SEND_ALL_TO_EMAIL || recipient.email }], params };
        });

        await this.sendBatch(subject as string, html, versions, replyTo, htmlParams);
      }
    }
  },

  async sendBatch(subject, html, versions, replyTo, htmlParams = {}) {
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
        messageVersions: versions.map((version) => ({
          ...version,
          params: withSafeHtmlParams(version.params, htmlParams),
        })),
      });
    } catch (err) {
      log.warn('Failed to send email batch', { err });
    }
  },
};
