import { appConfig } from 'config';
import i18n from 'i18next';
import { Text } from 'jsx-email';
import type { requestTypeEnum } from '#/db/schema/requests';
import { EmailBody, EmailContainer, EmailHeader, EmailLogo, Footer } from '../components';
import type { BasicTemplateType } from '../types';

export interface RequestResponseEmailProps extends BasicTemplateType {
  type: (typeof requestTypeEnum)[number];
  message: string | null;
}

/**
 * Email template for responses to user requests such as waitlist signups, newsletter subscriptions, or contact form submissions.
 */
export const RequestResponseEmail = ({ lng, type, subject, message }: RequestResponseEmailProps) => {
  return (
    <EmailContainer previewText={subject}>
      <EmailHeader
        headerText={
          <div dangerouslySetInnerHTML={{ __html: i18n.t(`backend:email.${type}_request.title`, { lng }) }} />
        }
      />
      <EmailBody>
        <Text>{subject}</Text>
        {message && <Text>{message}</Text>}

        <Text>
          <span
            dangerouslySetInnerHTML={{
              __html: i18n.t(`backend:email.${type}_request.text`, { lng, appName: appConfig.name }),
            }}
          />
        </Text>
      </EmailBody>

      <EmailLogo />
      <Footer />
    </EmailContainer>
  );
};

// Template export
export const Template = RequestResponseEmail;
