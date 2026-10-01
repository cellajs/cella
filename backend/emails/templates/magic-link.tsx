import { appConfig } from 'shared';
import { EmailMessage } from '../components';
import { i18n, plainText } from '../i18n';
import { defineEmailTemplate, type EmailRecipient } from '../types';

const appName = appConfig.name;

interface MagicLinkStatic {
  magicLinkUrl: string;
  name: string;
  isNewUser: boolean;
}

export const magicLinkEmail = defineEmailTemplate<MagicLinkStatic, EmailRecipient & { email: string }>()({
  translate(lng, { magicLinkUrl, name, isNewUser }) {
    const keyBase = isNewUser ? 'backend:email.magic_link.signup' : 'backend:email.magic_link';
    return {
      subject: i18n.t(`${keyBase}.subject`, { lng, appName, ...plainText }),
      previewText: i18n.t(`${keyBase}.preview`, { appName, lng, ...plainText }),
      headerHtml: i18n.t(`${keyBase}.title`, { appName, lng }),
      hiText: name ? i18n.t('backend:email.hi', { lng, name, ...plainText }) : '',
      bodyHtml: i18n.t(`${keyBase}.text`, { lng, appName }),
      buttonText: i18n.t(isNewUser ? 'c:sign_up' : 'c:sign_in', { lng }),
      supportText: i18n.t('backend:email.support_email', { lng }),
      magicLinkUrl,
    };
  },
  component({ previewText, headerHtml, hiText, bodyHtml, buttonText, magicLinkUrl, supportText }) {
    return (
      <EmailMessage
        previewText={previewText}
        headerHtml={headerHtml}
        greeting={hiText}
        bodyHtml={bodyHtml}
        action={{ label: buttonText, href: magicLinkUrl }}
        supportText={supportText}
      />
    );
  },
  preview: { statics: { magicLinkUrl: 'https://example.com/magic', name: 'Emily', isNewUser: false }, recipient: {} },
});
