import { appConfig } from 'shared';
import { EmailBody, EmailButton, EmailContainer, EmailHeader, EmailLogo, Footer, Text } from '../components';
import i18n from '../i18n';
import { greetingStyle } from '../styles';
import type { BasicTemplateType } from '../types';

interface CreatePasswordEmailProps extends BasicTemplateType {
  createPasswordLink: string;
}

const appName = appConfig.name;

/**
 * Email template for users to create a password for their account.
 */
export const CreatePasswordEmail = ({ name, lng, createPasswordLink }: CreatePasswordEmailProps) => {
  return (
    <EmailContainer previewText={i18n.t('backend:email.create_password.preview', { appName, lng })}>
      <EmailHeader headerText={i18n.t('backend:email.create_password.preview', { appName, lng })} />
      <EmailBody>
        {name && <Text style={greetingStyle}>{i18n.t('backend:email.hi', { lng, name })}</Text>}
        <Text>
          <span dangerouslySetInnerHTML={{ __html: i18n.t('backend:email.create_password.text', { appName, lng }) }} />{' '}
          {i18n.t('backend:email.create_password.ignore', { lng })}{' '}
          {i18n.t('backend:email.create_password.expire', { lng })}
        </Text>
        <EmailButton
          ButtonText={i18n.t('common:reset_resource', { resource: i18n.t('common:password').toLowerCase(), lng })}
          href={createPasswordLink}
        />
      </EmailBody>
      <EmailLogo />
      <Footer />
    </EmailContainer>
  );
};

// Template export
export const Template = CreatePasswordEmail;

// Preview props for jsx-email CLI
export const previewProps = {
  lng: 'en',
  subject: 'Reset password',
  name: 'Emily',
  createPasswordLink: 'https://cellajs.com/auth/reset-password?token=preview-token',
} satisfies CreatePasswordEmailProps;
