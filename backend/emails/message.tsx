import { Text } from 'jsx-email';
import { i18n } from '../src/lib/i18n';

import { AppLogo } from './components/app-logo';
import { EmailContainer } from './components/container';
import { EmailBody } from './components/email-body';
import { EmailHeader } from './components/email-header';
import { Footer } from './components/footer';
import type { BasicTemplateType } from './types';

interface Props extends BasicTemplateType {
  content: string;
  subject: string;
  appName: string;
}

export const MessageEmail = ({ userLanguage: lng, appName, content, subject }: Props) => {
  return (
    <EmailContainer previewText={subject}>
      <EmailHeader
        headerText={
          <div
            // biome-ignore lint/security/noDangerouslySetInnerHtml: <explanation>
            dangerouslySetInnerHTML={{
              __html: i18n.t('backend:email.message.title', { appName, lng }),
            }}
          />
        }
      />
      <EmailBody>
        <Text>{subject}</Text>

        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: <explanation>*/}
        <div dangerouslySetInnerHTML={{ __html: content }} />
      </EmailBody>

      <AppLogo />
      <Footer />
    </EmailContainer>
  );
};

// Template export
export const Template = MessageEmail;
