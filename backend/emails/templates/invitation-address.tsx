import { EmailMessage } from '../components';
import { i18n, plainText } from '../i18n';
import { endingFor, linkExpiresText } from '../shared-texts';
import { defineEmailTemplate } from '../types';

interface InvitationAddressStatic {
  entityName: string;
  /** The signed-in account's address, which joins once this one is confirmed. */
  accountEmail: string;
  confirmUrl: string;
}

/**
 * Asks the invited inbox to confirm the address for an account signed in on another one. The link is linked to that
 * account, so only it can use the link, and opening it adds this address to the account.
 */
export const invitationAddressEmail = defineEmailTemplate<InvitationAddressStatic>()({
  translate(lng, { entityName, accountEmail, confirmUrl }) {
    return {
      subject: i18n.t('backend:email.invitation_address.subject', { lng, entityName, ...plainText }),
      previewText: i18n.t('backend:email.invitation_address.preview', { lng, entityName, ...plainText }),
      headerHtml: i18n.t('backend:email.invitation_address.title', { lng, entityName }),
      bodyHtml: i18n.t('backend:email.invitation_address.text', { lng, entityName, accountEmail }),
      expiresText: linkExpiresText(lng, 'invitation'),
      endingHtml: endingFor(lng, 'ignore'),
      buttonText: i18n.t('c:confirm', { lng }),
      supportText: i18n.t('backend:email.support_email', { lng }),
      confirmUrl,
    };
  },
  component({ previewText, headerHtml, bodyHtml, expiresText, endingHtml, buttonText, supportText, confirmUrl, frame }) {
    return (
      <EmailMessage
        frame={frame}
        previewText={previewText}
        headerHtml={headerHtml}
        bodyHtml={bodyHtml}
        action={{ label: buttonText, href: confirmUrl }}
        note={expiresText}
        endingHtml={endingHtml}
        supportText={supportText}
      />
    );
  },
  requestDetails: true,
  preview: {
    statics: { entityName: 'Acme', accountEmail: 'emily@personal.example', confirmUrl: 'https://example.com/invite' },
    recipient: {},
  },
});
