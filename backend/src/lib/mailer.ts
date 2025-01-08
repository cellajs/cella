import { MailService } from '@sendgrid/mail';
import { config } from 'config';
import { env } from '../../env';

const sendgrid = new MailService();

sendgrid.setApiKey(env.SENDGRID_API_KEY ?? '');

// Send email, currently hardcoded to use SendGrid but can be changed to any other service
export const emailSender = {
  send: async (to: string, subject: string, html: string, replyTo?: string) => {
    await sendgrid.send({
      to: env.SEND_ALL_TO_EMAIL || to,
      replyTo: replyTo ? replyTo : config.supportEmail,
      from: config.notificationsEmail,
      subject,
      html,
    });
  },
};
