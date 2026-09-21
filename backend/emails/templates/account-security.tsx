import { appConfig } from 'shared';
import { EmailBody, EmailContainer, EmailFooter, EmailHeader, EmailLogo, EmailText, SafeHtml } from '../components';
import { i18n } from '../i18n';
import { defineEmailTemplate } from '../types';

type AccountSecurityType =
  | 'mfa-enabled'
  | 'mfa-disabled'
  | 'totp-lockout'
  | 'sysadmin-fail'
  | 'sysadmin-signin'
  | 'impersonation-started'
  | 'passkey-added'
  | 'passkey-removed'
  | 'totp-added'
  | 'totp-removed'
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
    return {
      subject: i18n.t(`backend:email.account_security.${type}.title`, { ...baseProps, ...details }),
      previewText: i18n.t('backend:email.account_security.preview', { ...baseProps, name }),
      headerText: i18n.t(`backend:email.account_security.${type}.title`, baseProps),
      // Details can carry request-derived text (route, browser, names) and the body renders as HTML, so escape them here. The subject is plain text.
      bodyHtml: i18n.t(`backend:email.account_security.${type}.text`, {
        ...baseProps,
        ...details,
        interpolation: { escapeValue: true },
      }),
      supportText: i18n.t('backend:email.support_email', { lng }),
    };
  },
  component({ previewText, headerText, bodyHtml, supportText }) {
    return (
      <EmailContainer previewText={previewText}>
        <EmailHeader headerText={headerText} />
        <EmailBody>
          <EmailText>
            <SafeHtml html={bodyHtml} policy="inline" />
          </EmailText>
        </EmailBody>
        <EmailLogo />
        <EmailFooter supportText={supportText} />
      </EmailContainer>
    );
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
