import { BrevoClient } from '@getbrevo/brevo';
import { appConfig } from 'shared';
import { env } from '#/env';
import { logEvent } from '#/utils/logger';
import { sanitizeEmailSubject } from '#/utils/sanitize-email-subject';
import { render } from '../../emails/renderer/render';
import type { EmailRecipient, EmailTemplateDef } from '../../emails/types';

const brevoClient = env.BREVO_API_KEY ? new BrevoClient({ apiKey: env.BREVO_API_KEY }) : undefined;
if (!brevoClient && appConfig.mode !== 'test') logEvent(null, 'info', 'Email sending disabled: BREVO_API_KEY missing');

/* -------------------------------- Constants ------------------------------- */

const MAX_VERSIONS_PER_CALL = 99;

/* ---------------------------------- Types --------------------------------- */

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
  ): Promise<void>;
};

export const mailer: Mailer = {
  /**
   * Prepare and send emails using Brevo `messageVersions` batching.
   *
   * 1. Groups recipients by language
   * 2. Calls `translate(lng, statics)` once per language group
   * 3. Renders the component once per language with Brevo `{{params.x}}` placeholders
   * 4. Sends in batches of 99 recipients via `messageVersions`
   */
  async prepareEmails<TStatic, TRecipient extends EmailRecipient>(
    template: EmailTemplateDef<TStatic, TRecipient>,
    staticProps: TStatic,
    recipients: TRecipient[],
    replyTo?: string,
  ) {
    if (!recipients.length) return;

    // Group by language
    const byLng = new Map<string, TRecipient[]>();
    for (const r of recipients) {
      const group = byLng.get(r.lng) ?? [];
      group.push(r);
      byLng.set(r.lng, group);
    }

    for (const [lng, lngRecipients] of byLng) {
      // Translate once per language
      const translated = template.translate(lng, staticProps);
      const { subject, ...componentProps } = translated;

      // Determine per-recipient keys (everything beyond email/lng)
      const recipientKeys = Object.keys(lngRecipients[0]).filter((k) => k !== 'email' && k !== 'lng');

      // Build placeholder values for rendering: { name: '{{params.name}}', inviteLink: '{{params.inviteLink}}' }
      const placeholderProps: Record<string, string> = {};
      for (const k of recipientKeys) {
        placeholderProps[k] = `{{params.${k}}}`;
      }

      // Render HTML once with translated strings + placeholders
      const html = await render(template.component({ ...componentProps, ...placeholderProps }));

      // Build messageVersions and send in batches
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

        await this.sendBatch(subject as string, html, versions, replyTo);
      }
    }
  },

  /**
   * Send a batch of emails via Brevo `messageVersions`.
   */
  async sendBatch(subject, html, versions, replyTo) {
    if (!brevoClient) return;
    if (appConfig.mode === 'test' && !env.TEST_SEND_EMAILS) return;

    try {
      await brevoClient.transactionalEmails.sendTransacEmail({
        subject: sanitizeEmailSubject(subject || `${appConfig.name} message`),
        htmlContent: html,
        sender: { email: appConfig.senderEmail },
        replyTo: { email: replyTo || appConfig.supportEmail },
        messageVersions: versions,
      });
    } catch (err) {
      logEvent(null, 'warn', 'Failed to send email batch', { error: err instanceof Error ? err.message : String(err) });
    }
  },
};
