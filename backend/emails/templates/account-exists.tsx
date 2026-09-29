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
import { i18n, plainText } from '../i18n';
import { greetingStyle } from '../styles';
import { defineEmailTemplate } from '../types';

const appName = appConfig.name;

interface AccountExistsStatic {
  name: string;
}

/**
 * Answers a waitlist request from an address that has an account already. The form answers every request alike, so
 * this mail is where the owner learns it: nothing is stored, and the button leads to sign-in.
 */
export const accountExistsEmail = defineEmailTemplate<AccountExistsStatic>()({
  translate(lng, { name }) {
    return {
      subject: i18n.t('backend:email.account_exists.subject', { lng, appName, ...plainText }),
      previewText: i18n.t('backend:email.account_exists.preview', { lng, appName, ...plainText }),
      headerText: i18n.t('backend:email.account_exists.title', { lng, appName, ...plainText }),
      hiText: name ? i18n.t('backend:email.hi', { lng, name, ...plainText }) : '',
      bodyHtml: i18n.t('backend:email.account_exists.text', { lng, appName }),
      buttonText: i18n.t('c:sign_in', { lng }),
      signInUrl: `${appConfig.frontendUrl}/auth/authenticate`,
      supportText: i18n.t('backend:email.support_email', { lng }),
    };
  },
  component({ previewText, headerText, hiText, bodyHtml, buttonText, signInUrl, supportText }) {
    return (
      <EmailContainer previewText={previewText}>
        <EmailHeader headerText={headerText} />
        <EmailBody>
          {hiText && <EmailText style={greetingStyle}>{hiText}</EmailText>}
          <EmailText>
            <SafeHtml html={bodyHtml} policy="inline" />
          </EmailText>
          <EmailButton ButtonText={buttonText} href={signInUrl} />
        </EmailBody>
        <EmailLogo />
        <EmailFooter supportText={supportText} />
      </EmailContainer>
    );
  },
  preview: {
    statics: { name: 'Emily' },
    recipient: {},
  },
});
