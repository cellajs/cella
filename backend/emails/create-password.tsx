import { Link, Text } from 'jsx-email';

import { config } from 'config';
import { i18n } from '../src/lib/i18n';

import { AppLogo } from './components/app-logo';
import { EmailContainer } from './components/container';
import { EmailBody } from './components/email-body';
import { EmailButton } from './components/email-button';
import { Footer } from './components/footer';
import { UserName } from './components/user-name';
import type { BasicTemplateType } from './types';

interface Props extends BasicTemplateType {
  createPasswordLink: string;
}

const baseUrl = config.frontendUrl;
const createPasswordUrl = `${baseUrl}/auth/create-password`;
const appName = config.name;

export const CreatePasswordEmail = ({ userName, userLanguage: lng, createPasswordLink = baseUrl }: Props) => {
  return (
    <EmailContainer previewText={i18n.t('backend:email.create_password.preview', { appName, lng })}>
      <EmailBody>
        {userName && <UserName beforeText={i18n.t('backend:email.hi', { lng })} userName={userName} />}

        <div
          // biome-ignore lint/security/noDangerouslySetInnerHtml: <explanation>
          dangerouslySetInnerHTML={{
            __html: i18n.t('backend:email.create_password.text', { appName, lng }),
          }}
        />
        <EmailButton ButtonText={i18n.t('common:reset_password', { lng })} href={createPasswordLink} />

        <Text style={{ fontSize: '0.75rem', textAlign: 'center' }}>
          {i18n.t('backend:email.create_password.expire', { lng })} <Link href={createPasswordUrl}>{createPasswordUrl}</Link>
        </Text>

        <Text style={{ fontSize: '0.75rem', textAlign: 'center' }}>{i18n.t('backend:email.create_password.ignore', { lng })}</Text>
      </EmailBody>
      <AppLogo />
      <Footer />
    </EmailContainer>
  );
};

// Template export
export const Template = CreatePasswordEmail;
