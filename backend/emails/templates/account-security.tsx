import { appConfig } from 'shared';
import { EmailMessage } from '../components';
import { i18n, plainText } from '../i18n';
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
  | 'invitation-accepted-elsewhere'
  | 'new-sign-in';

interface AccountSecurityStatic {
  name: string;
  type: AccountSecurityType;
  details?: Record<string, string | number>;
}

/** Mails about what another person did to the account: they carry no request details, which would be that person's. */
const othersActions: AccountSecurityType[] = ['impersonation-started', 'invitation-accepted-elsewhere'];

export const accountSecurityEmail = defineEmailTemplate<AccountSecurityStatic>()({
  translate(lng, { name, type, details }) {
    const baseProps = { lng, appName: appConfig.name };
    return {
      subject: i18n.t(`backend:email.account_security.${type}.title`, { ...baseProps, ...details, ...plainText }),
      previewText: i18n.t('backend:email.account_security.preview', { ...baseProps, name, ...plainText }),
      headerHtml: i18n.t(`backend:email.account_security.${type}.title`, baseProps),
      // Details can carry request-derived text (route, browser, names); the body renders as HTML, so they stay escaped.
      bodyHtml: i18n.t(`backend:email.account_security.${type}.text`, { ...baseProps, ...details }),
      supportText: i18n.t('backend:email.support_email', { lng }),
    };
  },
  component({ previewText, headerHtml, bodyHtml, supportText, frame }) {
    return <EmailMessage frame={frame} previewText={previewText} headerHtml={headerHtml} bodyHtml={bodyHtml} supportText={supportText} />;
  },
  requestDetails: ({ type }) => !othersActions.includes(type),
  preview: {
    statics: {
      name: 'Emily',
      type: 'new-sign-in',
      details: { strategy: 'Passkey', accountUrl: `${appConfig.frontendUrl}/account` },
    },
    recipient: {},
  },
});
