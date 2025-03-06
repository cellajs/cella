import { MailService } from '@sendgrid/mail';
import { config } from 'config';
import { render } from 'jsx-email';
import { env } from '../env';

const sendgrid = new MailService();
// Check if the API key is set
const hasApiKey = !!env.SENDGRID_API_KEY;

if (hasApiKey) sendgrid.setApiKey(env.SENDGRID_API_KEY ?? '');

// Basic email template type
export type BasicTemplateType = {
  lng: string;
  subject: string;
  name?: string;
  testEmail?: boolean;
  senderThumbnailUrl?: string | null;
  senderName?: string;
  unsubscribeLink?: string;
};

export const mailer = {
  /**
   * Prepare and send emails to multiple recipients using a provided template.
   * It will render the template for each recipient and send the email.
   *
   * @param template - React component template that will be used to render the email content.
   * @param staticProps - Static properties that are shared across all recipients, such as subject and other common data.
   * @param recipients - The list of recipients with email addresses and any recipient-specific properties.
   * @param replyTo - Optional, email address for the "Reply-To" field.
   */
  async prepareEmails<T extends BasicTemplateType, R extends { email: string }>(
    template: (props: T & R) => React.ReactElement,
    staticProps: Partial<T> & BasicTemplateType,
    recipients: R[],
    replyTo?: string,
  ) {
    // In future, batch these in background job if large
    for (const recipient of recipients) {
      const templateProps: T & R = {
        ...staticProps,
        ...recipient,
      } as T & R;

      // Render the email template
      const emailHtml = await render(template(templateProps));

      await this.send(recipient.email, staticProps.subject, emailHtml, replyTo);
    }
  },

  /**
   * Send an email using the SendGrid service.
   *
   * @param to - Recipient email address.
   * @param subject - Subject of the email.
   * @param html - HTML content of the email.
   * @param replyTo - Optional, email address for the "Reply-To" field.
   */
  async send(to: string, subject: string, html: string, replyTo?: string) {
    if (!hasApiKey) {
      console.info(`Email to ${to} is not sent because API key is missing.`);
      return;
    }

    console.info(`Sending email to ${to}...`, subject, html);

    try {
      await sendgrid.send({
        to: env.SEND_ALL_TO_EMAIL || to,
        replyTo: replyTo || config.supportEmail,
        from: config.notificationsEmail,
        subject: subject || `${config.name} message.`,
        html,
      });
    } catch (err) {
      console.warn('Failed to send email. \n', err);
    }
  },
};
