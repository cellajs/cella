import { appConfig } from 'config';
import i18n from 'i18next';
import { Link, Text } from 'jsx-email';
import { EmailBody, EmailButton, EmailContainer, EmailHeader, EmailLogo, Footer } from '../components';
import type { BasicTemplateType } from '../types';

interface CreatePasswordEmailProps extends BasicTemplateType {
  createPasswordLink: string;
}

const baseUrl = appConfig.frontendUrl;
const createPasswordUrl = `${baseUrl}/auth/request-password`;
const appName = appConfig.name;

/**
 * Email template for users to create a password for their account.
 */
export const CreatePasswordEmail = ({ name, lng, createPasswordLink }: CreatePasswordEmailProps) => {
  return (
    <EmailContainer previewText={i18n.t('backend:email.create_password.preview', { appName, lng })}>
      <EmailHeader headerText={i18n.t('backend:email.create_password.preview', { appName, lng })} />
      <EmailBody>
        <Text>
          <p style={{ marginBottom: '4px' }}>{name && i18n.t('backend:email.hi', { lng, name })}</p>
          <div dangerouslySetInnerHTML={{ __html: i18n.t('backend:email.create_password.text', { appName, lng }) }} />
        </Text>
        <EmailButton
          ButtonText={i18n.t('common:reset_resource', { resource: i18n.t('common:password').toLowerCase(), lng })}
          href={createPasswordLink}
        />

        <Text style={{ fontSize: '0.85rem', textAlign: 'center' }}>
          {i18n.t('backend:email.create_password.expire', { lng })}{' '}
          <Link href={createPasswordUrl}>{createPasswordUrl}</Link>
        </Text>

        <Text style={{ fontSize: '0.85rem', textAlign: 'center' }}>
          {i18n.t('backend:email.create_password.ignore', { lng })}
        </Text>
      </EmailBody>
      <EmailLogo />
      <Footer />
    </EmailContainer>
  );
};

// Template export
export const Template = CreatePasswordEmail;
