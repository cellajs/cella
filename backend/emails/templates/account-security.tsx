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

export const accountSecurityEmail = defineEmailTemplate<AccountSecurityStatic>()({
  translate(lng, { name, type, details }) {
    const baseProps = { lng, appName: appConfig.name };
    // The location line exists only when a country is known; the text keys splice it in unescaped ({{- location}}), and
    // the country inside it was escaped when the line was translated.
    const location = details?.country ? i18n.t('backend:email.account_security.location', { ...baseProps, country: details.country }) : '';
    return {
      subject: i18n.t(`backend:email.account_security.${type}.title`, { ...baseProps, ...details, ...plainText }),
      previewText: i18n.t('backend:email.account_security.preview', { ...baseProps, name, ...plainText }),
      headerHtml: i18n.t(`backend:email.account_security.${type}.title`, baseProps),
      // Details can carry request-derived text (route, browser, names); the body renders as HTML, so they stay escaped.
      bodyHtml: i18n.t(`backend:email.account_security.${type}.text`, { ...baseProps, ...details, location }),
      supportText: i18n.t('backend:email.support_email', { lng }),
    };
  },
  component({ previewText, headerHtml, bodyHtml, supportText }) {
    return <EmailMessage previewText={previewText} headerHtml={headerHtml} bodyHtml={bodyHtml} supportText={supportText} />;
  },
  preview: {
    statics: {
      name: 'Emily',
      type: 'new-sign-in',
      details: {
        timestamp: '2026-01-01 09:30:00 UTC',
        browser: 'Firefox',
        os: 'macOS',
        country: 'Netherlands',
        strategy: 'Passkey',
        accountUrl: `${appConfig.frontendUrl}/account`,
      },
    },
    recipient: {},
  },
});
