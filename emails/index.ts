import sendgrid from '@sendgrid/mail';

import config from '../config';

sendgrid.setApiKey(process.env.SENDGRID_API_KEY ?? '');

export default {
  send: async (to: string, subject: string, html: string) => {
    await sendgrid.send({
      to,
      from: config.notificationsEmail,
      subject,
      html,
    });
  },
};
