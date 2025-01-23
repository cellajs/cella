import { MailService } from '@sendgrid/mail';
import { config } from 'config';
import { env } from '../../env';

const sendgrid = new MailService();
// Check if the API key is set
const hasApiKey = !!env.SENDGRID_API_KEY;

if (hasApiKey) {
  sendgrid.setApiKey(env.SENDGRID_API_KEY ?? '');
}

// Send email, currently hardcoded to use SendGrid but can be changed to any other service
export const emailSender = {
  send: async (to: string, subject: string, html: string, replyTo?: string) => {
    if (!hasApiKey) {
      console.info(`Email to ${to} is not sent because API key is missing.`);
      return;
    }

    try {
      await sendgrid.send({
        to: env.SEND_ALL_TO_EMAIL || to,
        replyTo: replyTo ? replyTo : config.supportEmail,
        from: config.notificationsEmail,
        subject: subject || `${config.name} message.`,
        html,
      });
    } catch (err) {
      console.warn('Failed to send email. \n', err);
    }
  },
};
