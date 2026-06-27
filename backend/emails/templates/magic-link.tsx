import { appConfig } from 'shared';
import {
  EmailBody,
  EmailButton,
  EmailContainer,
  EmailFooter,
  EmailHeader,
  EmailLogo,
  EmailText,
  SafeHtml,
} from '../components';
import i18n from '../i18n';
import { greetingStyle } from '../styles';
import { defineEmailTemplate, type EmailRecipient } from '../types';

const appName = appConfig.name;

interface MagicLinkStatic {
  magicLinkUrl: string;
  name: string;
  isNewUser: boolean;
}

/**
 * Email template for magic link sign-in and sign-up.
 */
export const magicLinkEmail = defineEmailTemplate<MagicLinkStatic, EmailRecipient & { email: string }>()({
  translate(lng, { magicLinkUrl, name, isNewUser }) {
    const keyBase = isNewUser ? 'backend:email.magic_link.signup' : 'backend:email.magic_link';
    return {
      subject: i18n.t(`${keyBase}.subject`, { lng, appName }),
      previewText: i18n.t(`${keyBase}.preview`, { appName, lng }),
      headerText: i18n.t(`${keyBase}.title`, { appName, lng }),
      hiText: name ? i18n.t('backend:email.hi', { lng, name }) : '',
      bodyHtml: i18n.t(`${keyBase}.text`, { lng, appName }),
      buttonText: i18n.t(isNewUser ? 'c:sign_up' : 'c:sign_in', { lng }),
      supportText: i18n.t('backend:email.support_email', { lng }),
      magicLinkUrl,
    };
  },
  component({ previewText, headerText, hiText, bodyHtml, buttonText, magicLinkUrl, supportText }) {
    return (
      <EmailContainer previewText={previewText}>
        <EmailHeader headerText={headerText} />
        <EmailBody>
          {hiText && <EmailText style={greetingStyle}>{hiText}</EmailText>}
          <EmailText>
            <SafeHtml html={bodyHtml} policy="inline" />
          </EmailText>
          <EmailButton ButtonText={buttonText} href={magicLinkUrl} />
        </EmailBody>
        <EmailLogo />
        <EmailFooter supportText={supportText} />
      </EmailContainer>
    );
  },
  preview: {
    statics: { magicLinkUrl: 'https://example.com/magic', name: 'Emily', isNewUser: false },
    recipient: {},
  },
});
