import { Section, Text } from 'jsx-email';
import { i18n } from '../src/lib/i18n';

import { AppLogo } from './components/app-logo';
import { EmailContainer } from './components/container';
import { EmailHeader } from './components/email-header';
import { Footer } from './components/footer';
import type { BasicTemplateType } from './types';

interface Props extends BasicTemplateType {
  content: string;
  subject: string;
  appName: string;
}

export const RequestsFeedback = ({ userLanguage: lng, appName, content, subject }: Props) => {
  return (
    <EmailContainer
      previewText={subject}
      bodyStyle={{ padding: '0 0.625rem' }}
      containerStyle={{
        borderColor: '#f0f0f0',
        maxWidth: '100%',
        color: '#404040',
        lineHeight: '1.5',
      }}
    >
      <EmailHeader
        headerText={
          <div
            // biome-ignore lint/security/noDangerouslySetInnerHtml: <explanation>
            dangerouslySetInnerHTML={{
              __html: i18n.t('backend:email.feedback_letter_title', { appName, lng }),
            }}
          />
        }
      />
      <Section
        style={{
          borderRadius: '.75rem',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: '#eaeaea',
          padding: '1.5rem',
        }}
      >
        <Text>{subject}</Text>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: we need send it cos blackNote return an html*/}
        <div dangerouslySetInnerHTML={{ __html: content }} />
      </Section>

      <AppLogo />
      <Footer />
    </EmailContainer>
  );
};

// Template export
export const Template = RequestsFeedback;
