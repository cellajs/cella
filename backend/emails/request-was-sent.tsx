import i18n from 'i18next';
import { Text } from 'jsx-email';

import { appConfig } from 'config';
import type { BasicTemplateType } from '../src/lib/mailer';
import { AppLogo } from './components/app-logo';
import { EmailContainer } from './components/container';
import { EmailBody } from './components/email-body';
import { EmailHeader } from './components/email-header';
import { Footer } from './components/footer';

export interface RequestResponseEmailProps extends BasicTemplateType {
  type: "waitlist" | "newsletter" | "contact",
  message: string | null 
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

        <Text><span dangerouslySetInnerHTML={{ __html: i18n.t(`backend:email.${type}_request.text`, { lng, appName: appConfig.name }) }} /></Text>

      </EmailBody>

      <AppLogo />
      <Footer />
    </EmailContainer>
  );
};

// Template export
export const Template = RequestResponseEmail;
