import { MailService } from '@sendgrid/mail';
import { config } from 'config';
import { render } from 'jsx-email';
import { env } from '../../env';

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
  async prepareEmails<T extends BasicTemplateType, R extends { email: string }>(
    template: (props: T & R) => React.ReactElement,
    staticProps: Partial<T> & BasicTemplateType,
    recipients: R[],
    replyTo?: string,
  ) {
    // TODO batch with typescript batch lib
    //  Put in background job if large
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

  // Send an email
  async send(to: string, subject: string, html: string, replyTo?: string) {
    if (!hasApiKey) {
      console.info(`Email to ${to} is not sent because API key is missing.`);
      return;
    }

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
