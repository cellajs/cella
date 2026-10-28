import { appConfig } from 'shared';
import { EmailMessage } from '../components';
import { i18n, plainText } from '../i18n';
import { endingFor } from '../shared-texts';
import { defineEmailTemplate } from '../types';

const appName = appConfig.name;

interface SsoRequiredStatic {
  name: string;
  /** The display name of the connection the account signs in through. */
  institution: string;
  /** The connection's sign-in entry on the frontend. */
  entryUrl: string;
}

/**
 * Answers a magic link request for an address whose organization requires its institution's sign-in. The form answers
 * a stranger as it answers any address, so this mail is where the owner learns why no link came.
 */
export const ssoRequiredEmail = defineEmailTemplate<SsoRequiredStatic>()({
  translate(lng, { name, institution, entryUrl }) {
    return {
      subject: i18n.t('backend:email.sso_required.subject', { lng, appName, institution, ...plainText }),
      previewText: i18n.t('backend:email.sso_required.preview', { lng, appName, institution, ...plainText }),
      headerHtml: i18n.t('backend:email.sso_required.title', { lng, appName }),
      hiText: name ? i18n.t('backend:email.hi', { lng, name, ...plainText }) : '',
      bodyHtml: i18n.t('backend:email.sso_required.text', { lng, appName, institution }),
      buttonText: i18n.t('c:sign_in_with_institution', { lng, institution, ...plainText }),
      entryUrl,
      endingHtml: endingFor(lng, 'no_change'),
      supportText: i18n.t('backend:email.support_email', { lng }),
    };
  },
  component({ previewText, headerHtml, hiText, bodyHtml, buttonText, entryUrl, endingHtml, supportText, frame }) {
    return (
      <EmailMessage
        frame={frame}
        previewText={previewText}
        headerHtml={headerHtml}
        greeting={hiText}
        bodyHtml={bodyHtml}
        action={{ label: buttonText, href: entryUrl }}
        endingHtml={endingHtml}
        supportText={supportText}
      />
    );
  },
  requestDetails: true,
  preview: {
    statics: { name: 'Emily', institution: 'Hogeschool Utrecht', entryUrl: 'https://example.com/auth/sso/connection-id' },
    recipient: {},
  },
});
