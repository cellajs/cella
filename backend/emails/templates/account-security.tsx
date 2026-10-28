import { EmailMessage } from '../components';
import { formatMailTime } from '../frame';
import { i18n, plainText } from '../i18n';
import { endingFor } from '../shared-texts';
import { defineEmailTemplate } from '../types';

type AccountSecurityType =
  | 'mfa-enabled'
  | 'mfa-disabled'
  | 'totp-lockout'
  | 'sysadmin-fail'
  | 'sysadmin-signin'
  | 'impersonation-started'
  | 'passkey-added'
  | 'passkey-deleted'
  | 'totp-added'
  | 'totp-deleted'
  | 'provider-connected'
  | 'tenant-created'
  | 'system-role-granted'
  | 'system-role-changed'
  | 'system-role-revoked'
  | 'new-sign-in';

/** Types the security inbox gets: operator mail, with no greeting and no advice for an account holder. */
const inboxTypes: AccountSecurityType[] = [
  'sysadmin-fail',
  'sysadmin-signin',
  'impersonation-started',
  'tenant-created',
  'system-role-granted',
  'system-role-changed',
  'system-role-revoked',
];

interface AccountSecurityStatic {
  name: string;
  type: AccountSecurityType;
  /** Values the type's text names; a `timestamp` is an ISO moment, shown in the reader's language. */
  details?: Record<string, string | number>;
}

export const accountSecurityEmail = defineEmailTemplate<AccountSecurityStatic>()({
  translate(lng, { name, type, details = {} }) {
    const baseProps = { lng };
    const values = typeof details.timestamp === 'string' ? { ...details, timestamp: formatMailTime(details.timestamp, lng) } : details;
    const forAccountHolder = !inboxTypes.includes(type);
    const title = i18n.t(`backend:email.account_security.${type}.title`, { ...baseProps, ...values, ...plainText });
    return {
      subject: i18n.t('backend:email.account_security.subject', { ...baseProps, title, ...plainText }),
      previewText: i18n.t('backend:email.account_security.preview', { ...baseProps, name, ...plainText }),
      headerHtml: i18n.t(`backend:email.account_security.${type}.title`, baseProps),
      hiText: forAccountHolder && name ? i18n.t('backend:email.hi', { lng, name, ...plainText }) : '',
      // Details can carry request-derived text (route, browser, names); the body renders as HTML, so they stay escaped.
      bodyHtml: i18n.t(`backend:email.account_security.${type}.text`, { ...baseProps, ...values }),
      endingHtml: forAccountHolder ? endingFor(lng, 'secure') : undefined,
      supportText: i18n.t('backend:email.support_email', { lng }),
    };
  },
  component({ previewText, headerHtml, hiText, bodyHtml, endingHtml, supportText, frame }) {
    return (
      <EmailMessage
        frame={frame}
        previewText={previewText}
        headerHtml={headerHtml}
        greeting={hiText}
        bodyHtml={bodyHtml}
        endingHtml={endingHtml}
        supportText={supportText}
      />
    );
  },
  requestDetails: true,
  preview: {
    statics: {
      name: 'Emily',
      type: 'new-sign-in',
      details: { strategy: 'Passkey' },
    },
    recipient: {},
  },
});
