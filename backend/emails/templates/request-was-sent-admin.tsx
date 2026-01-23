import { appConfig } from 'config';
import i18n from 'i18next';
import { Text } from 'jsx-email';
import { EmailBody } from '../components/email-body';
import { EmailContainer } from '../components/email-container';
import { EmailHeader } from '../components/email-header';
import { EmailLogo } from '../components/email-logo';
import { Footer } from '../components/footer';
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
      <EmailBody>
        <Text>{subject}</Text>
        {message && <Text>{message}</Text>}
      </EmailBody>

      <EmailLogo />
      <Footer />
    </EmailContainer>
  );
};

// Template export
export const Template = RequestInfoEmail;
