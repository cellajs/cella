import { appConfig } from 'shared';
import type { requestTypeEnum } from '#/db/schema/requests';
import { EmailBody, EmailContainer, EmailHeader, EmailLogo, Footer, Text } from '../components';
import i18n from '../i18n';
import type { BasicTemplateType } from '../types';

export interface RequestResponseEmailProps extends BasicTemplateType {
  type: (typeof requestTypeEnum)[number];
  message: string | null;
}

/**
 * Email template for responses to user requests such as waitlist signups, newsletter subscriptions, or contact form submissions.
 */
export const RequestResponseEmail = ({ lng, type, subject }: RequestResponseEmailProps) => {
  return (
    <EmailContainer previewText={subject}>
      <EmailHeader
        headerText={
          <div dangerouslySetInnerHTML={{ __html: i18n.t(`backend:email.${type}_request.title`, { lng }) }} />
        }
      />
      <EmailBody>
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

// Preview props for jsx-email CLI
export const previewProps = {
  lng: 'en',
  subject: 'Your request was sent',
  type: 'contact',
  message: null,
} satisfies RequestResponseEmailProps;
