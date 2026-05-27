import { appConfig } from 'shared';
import { EmailBody, EmailContainer, EmailFooter, EmailHeader, EmailLogo, EmailText, SafeHtml } from '../components';
import i18n from '../i18n';
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
  | 'tenant-created';

interface AccountSecurityStatic {
  name: string;
  type: AccountSecurityType;
  details?: Record<string, string | number>;
}

/**
 * Email template for account security notifications.
 */
export const accountSecurityEmail = defineEmailTemplate<AccountSecurityStatic>()({
  translate(lng, { name, type, details }) {
    const baseProps = { lng, appName: appConfig.name };
    return {
      subject: i18n.t(`backend:email.account_security.${type}.title`, { ...baseProps, ...details }),
      previewText: i18n.t('backend:email.account_security.preview', { ...baseProps, name }),
      headerText: i18n.t(`backend:email.account_security.${type}.title`, baseProps),
      bodyHtml: i18n.t(`backend:email.account_security.${type}.text`, { ...baseProps, ...details }),
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
});
