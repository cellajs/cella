import i18n from 'i18next';
import { Text } from 'jsx-email';
import { appConfig } from 'shared';
import { EmailBody, EmailContainer, EmailHeader, EmailLogo, Footer } from '../components';
import type { BasicTemplateType } from '../types';

type AccountSecurityType = 'mfa-enabled' | 'mfa-disabled' | 'wrong-password-lockout';

interface AccountSecurityProps extends BasicTemplateType {
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
      <EmailLogo />
      <Footer />
    </EmailContainer>
  );
};

// Template export
export const Template = AccountSecurity;
