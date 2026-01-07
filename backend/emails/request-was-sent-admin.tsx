import i18n from 'i18next';
import { Text } from 'jsx-email';

import { appConfig } from 'config';
import { AppLogo } from './components/app-logo';
import { EmailContainer } from './components/container';
import { EmailBody } from './components/email-body';
import { EmailHeader } from './components/email-header';
import { Footer } from './components/footer';
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
          <div dangerouslySetInnerHTML={{ __html: i18n.t(`backend:email.received_request.title`, { appName: appConfig.name, type, lng }) }} />
        }
      />
      <EmailBody>
        <Text>{subject}</Text>
        {message && <Text>{message}</Text>}
      </EmailBody>

      <AppLogo />
      <Footer />
    </EmailContainer>
  );
};

// Template export
export const Template = RequestInfoEmail;
