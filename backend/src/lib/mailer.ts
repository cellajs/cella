import { BrevoClient } from '@getbrevo/brevo';
import { render } from 'jsx-email';
import { appConfig } from 'shared';
import { env } from '#/env';
import { logEvent } from '#/utils/logger';
import { sanitizeEmailSubject } from '#/utils/sanitize-email-subject';

const brevoClient = env.BREVO_API_KEY ? new BrevoClient({ apiKey: env.BREVO_API_KEY }) : undefined;
if (!brevoClient && appConfig.mode !== 'test') logEvent(null, 'info', 'Email sending disabled: BREVO_API_KEY missing');

/* ---------------------------------- Types --------------------------------- */

type EmailComponent<P> = (props: P) => React.ReactElement;
type TemplateProps<T> = T extends EmailComponent<infer P> ? P : never;
type RecipientBase = { email: string };

type Mailer = {
  prepareEmails<Template extends (props: any) => React.ReactElement, R extends { email: string } = { email: string }>(
    template: Template,
    staticProps: Omit<TemplateProps<Template>, keyof R>,
    recipients: R[],
    replyTo?: string,
  ): Promise<void>;
  send(to: string, subject: string, html: string, replyTo?: string): Promise<void>;

  send(to: string, subject: string, html: string, replyTo?: string): Promise<void>;
};

export const mailer: Mailer = {
  /**
   * Prepare to send emails to multiple recipients using a provided template.
   * It will render the template for each recipient and send the email.
   *
   * @param template - React component template that will be used to render the email content.
   * @param staticProps - Static properties that are shared across all recipients, such as subject and other common data.
   * @param recipients - The list of recipients with email addresses and any recipient-specific properties.
   * @param replyTo - Optional, email address for the "Reply-To" field.
   */
  async prepareEmails<Template extends (props: any) => React.ReactElement, R extends RecipientBase = RecipientBase>(
    template: Template,
    staticProps: Omit<TemplateProps<Template>, keyof R>,
    recipients: R[],
    replyTo?: string,
  ) {
    // In future, batch these in background job if large
    for (const recipient of recipients) {
      const templateProps = {
        ...staticProps,
        ...recipient,
      } as TemplateProps<typeof template>;

      const html = await render(template(templateProps));

      await this.send(recipient.email, templateProps.subject, html, replyTo);
    }
  },

  /**
   * Send an email using the email service.
   *
   * @param to - Recipient email address.
   * @param subject - Subject of the email.
   * @param html - HTML content of the email.
   * @param replyTo - Optional, email address for the "Reply-To" field.
   */
  async send(to: string, subject: string, html: string, replyTo?: string) {
    if (!brevoClient) return;
    if (appConfig.mode === 'test' && !env.TEST_SEND_EMAILS) return;

    try {
      await brevoClient.transactionalEmails.sendTransacEmail({
        subject: sanitizeEmailSubject(subject || `${appConfig.name} message`),
        htmlContent: html,
        to: [{ email: env.SEND_ALL_TO_EMAIL || to }],
        replyTo: { email: replyTo || appConfig.supportEmail },
        sender: { email: appConfig.notificationsEmail },
      });
    } catch (err) {
      logEvent(null, 'warn', 'Failed to send email', { error: err instanceof Error ? err.message : String(err) });
    }
  },
};
