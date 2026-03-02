import { appConfig } from 'shared';
import { EmailBody, EmailContainer, EmailHeader, EmailLogo, Footer, Text } from '../components';
import i18n from '../i18n';
import { RequestResponseEmailProps } from './request-was-sent';

/**
 * Email template for responses to sysadmin after users requests such as waitlist signups, newsletter subscriptions, or
 * contact form submissions.
 */
export const RequestInfoEmail = ({ lng, type, subject, message }: RequestResponseEmailProps) => {
  return (
    <EmailContainer previewText={subject}>
      <EmailHeader
        headerText={
          <div
            dangerouslySetInnerHTML={{
              __html: i18n.t(`backend:email.received_request.title`, { appName: appConfig.name, type, lng }),
            }}
          />
        }
      />
      <EmailBody>{message && <Text>{message}</Text>}</EmailBody>

      <EmailLogo />
      <Footer />
    </EmailContainer>
  );
};

// Template export
export const Template = RequestInfoEmail;

// Preview props for jsx-email CLI
export const previewProps = {
  lng: 'en',
  subject: 'New contact request',
  type: 'contact',
  message: 'Hi, I would like to learn more about your product.',
} satisfies RequestResponseEmailProps;
