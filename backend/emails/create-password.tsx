import { Link, Text } from 'jsx-email';

import { config } from 'config';
import i18n from 'i18next';

import type { BasicTemplateType } from '../src/lib/mailer';
import { AppLogo } from './components/app-logo';
import { EmailContainer } from './components/container';
import { EmailBody } from './components/email-body';
import { EmailButton } from './components/email-button';
import { EmailHeader } from './components/email-header';
import { Footer } from './components/footer';

export interface CreatePasswordEmailProps extends BasicTemplateType {
  createPasswordLink: string;
}

const baseUrl = config.frontendUrl;
const createPasswordUrl = `${baseUrl}/auth/request-password`;
const appName = config.name;

export const CreatePasswordEmail = ({ name, lng, createPasswordLink }: CreatePasswordEmailProps) => {
  return (
    <EmailContainer previewText={i18n.t('backend:email.create_password.preview', { appName, lng })}>
      <EmailHeader headerText={i18n.t('backend:email.create_password.preview', { appName, lng })} />
      <EmailBody>
        <Text>
          <p style={{ marginBottom: '4px' }}>{name && i18n.t('backend:email.hi', { lng, name })}</p>
          <div
            // biome-ignore lint/security/noDangerouslySetInnerHtml: <explanation>
            dangerouslySetInnerHTML={{
              __html: i18n.t('backend:email.create_password.text', { appName, lng }),
            }}
          />
        </Text>
        <EmailButton ButtonText={i18n.t('common:reset_password', { lng })} href={createPasswordLink} />

        <Text style={{ fontSize: '0.85rem', textAlign: 'center' }}>
          {i18n.t('backend:email.create_password.expire', { lng })} <Link href={createPasswordUrl}>{createPasswordUrl}</Link>
        </Text>

        <Text style={{ fontSize: '0.85rem', textAlign: 'center' }}>{i18n.t('backend:email.create_password.ignore', { lng })}</Text>
      </EmailBody>
      <AppLogo />
      <Footer />
    </EmailContainer>
  );
};

// Template export
export const Template = CreatePasswordEmail;
