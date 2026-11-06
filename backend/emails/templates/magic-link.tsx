import { EmailMessage } from '../components';
import { i18n, plainText } from '../i18n';
import { endingFor, linkExpiresText } from '../shared-texts';
import { defineEmailTemplate, type EmailRecipient } from '../types';

interface MagicLinkStatic {
  magicLinkUrl: string;
  /** The account's name; empty for a sign-up, which greets no one. */
  name: string;
  isNewUser: boolean;
  /** A sign-up for an address with a pending invitation: the link completes it. */
  invited: boolean;
}

const previewStatics: MagicLinkStatic = { magicLinkUrl: 'https://example.com/magic', name: 'Emily', isNewUser: false, invited: false };

export const magicLinkEmail = defineEmailTemplate<MagicLinkStatic, EmailRecipient & { email: string }>()({
  translate(lng, { magicLinkUrl, name, isNewUser, invited }) {
    const keyBase = isNewUser ? 'backend:email.magic_link.signup' : 'backend:email.magic_link';
    return {
      subject: i18n.t(`${keyBase}.subject`, { lng, ...plainText }),
      previewText: i18n.t(`${keyBase}.preview`, { lng, ...plainText }),
      headerHtml: i18n.t(`${keyBase}.title`, { lng }),
      hiText: name ? i18n.t('backend:email.hi', { lng, name, ...plainText }) : '',
      bodyHtml: i18n.t(isNewUser && invited ? 'backend:email.magic_link.signup_invited.text' : `${keyBase}.text`, { lng }),
      buttonText: i18n.t(isNewUser ? 'c:sign_up' : 'c:sign_in', { lng }),
      expiresText: linkExpiresText(lng, 'magic'),
      endingHtml: `${endingFor(lng, 'ignore')} ${i18n.t('backend:email.ending.no_forward', { lng })}`,
      supportText: i18n.t('backend:email.support_email', { lng }),
      magicLinkUrl,
    };
  },
  component({ previewText, headerHtml, hiText, bodyHtml, buttonText, expiresText, endingHtml, magicLinkUrl, supportText, frame }) {
    return (
      <EmailMessage
        frame={frame}
        previewText={previewText}
        headerHtml={headerHtml}
        greeting={hiText}
        bodyHtml={bodyHtml}
        action={{ label: buttonText, href: magicLinkUrl }}
        note={expiresText}
        endingHtml={endingHtml}
        supportText={supportText}
      />
    );
  },
  requestDetails: true,
  preview: { statics: previewStatics, recipient: {} },
  previewVariants: {
    signup: { statics: { ...previewStatics, name: '', isNewUser: true }, recipient: {} },
    'signup-invited': { statics: { ...previewStatics, name: '', isNewUser: true, invited: true }, recipient: {} },
  },
});
