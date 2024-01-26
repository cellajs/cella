import sendgrid from '@sendgrid/mail';
import { config } from 'config';
import { env } from 'env';

sendgrid.setApiKey(env.SENDGRID_API_KEY ?? '');

export const emailSender = {
  send: async (to: string, subject: string, html: string) => {
    await sendgrid.send({
      to,
      from: config.notificationsEmail,
      subject,
      html,
    });
  },
};
