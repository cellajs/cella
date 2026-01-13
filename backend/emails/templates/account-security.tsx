import { appConfig } from 'config';
import i18n from 'i18next';
import { Text } from 'jsx-email';
import type { BasicTemplateType } from '../../src/lib/mailer';
import { AppLogo } from '../components/app-logo';
import { EmailContainer } from '../components/container';
import { EmailBody } from '../components/email-body';
import { EmailHeader } from '../components/email-header';
import { Footer } from '../components/footer';

export type AccountSecurityType =
  | 'mfa-enabled'
  | 'mfa-disabled'
  | 'wrong-password-lockout';

export interface AccountSecurityProps extends BasicTemplateType {
  name: string;
  type: AccountSecurityType;
  details?: Record<string, string | number>; // Optional extra details for dynamic messages
}

/**
 * Email template for account security notifications.
 */
export const AccountSecurity = ({ lng, name, type, details }: AccountSecurityProps) => {
  // Base properties for all i18n calls
  const baseProps = { lng, appName: appConfig.name };

  const previewText = i18n.t(`backend:emails.account_security.preview`, { ...baseProps, name });

  const headerText = i18n.t(`backend:emails.account_security.${type}.title`, baseProps);
  const bodyText = i18n.t(`backend:emails.account_security.${type}.text`, { ...baseProps, ...details });

  return (
    <EmailContainer previewText={previewText}>
      <EmailHeader headerText={headerText} />
      <EmailBody>
        <Text>
          <span dangerouslySetInnerHTML={{ __html: bodyText }} />
        </Text>
      </EmailBody>
      <AppLogo />
      <Footer />
    </EmailContainer>
  );
};

// Template export
export const Template = AccountSecurity;
