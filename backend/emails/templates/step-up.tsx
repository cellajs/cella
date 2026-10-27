import { appConfig } from 'shared';
import { EmailLayout, EmailText, SafeHtml } from '../components';
import { i18n, plainText } from '../i18n';
import { greetingStyle } from '../styles';
import { defineEmailTemplate, type EmailRecipient } from '../types';

const appName = appConfig.name;

interface StepUpStatic {
  code: string;
  name: string;
}

// The code stays out of the subject and preview, which lock screens and mail lists show to anyone nearby.
const codeStyle = { fontSize: '1.75rem', fontWeight: 700, letterSpacing: '0.3em', textAlign: 'center', margin: '1.5rem 0' } as const;

/** The step-up code. Its request details name the browser, country and time that asked, so a reader talked into reading it out can tell. */
export const stepUpEmail = defineEmailTemplate<StepUpStatic, EmailRecipient & { email: string }>()({
  translate(lng, { code, name }) {
    return {
      subject: i18n.t('backend:email.step_up.subject', { lng, appName, ...plainText }),
      previewText: i18n.t('backend:email.step_up.preview', { lng, appName, ...plainText }),
      headerHtml: i18n.t('backend:email.step_up.title', { lng, appName }),
      hiText: name ? i18n.t('backend:email.hi', { lng, name, ...plainText }) : '',
      bodyHtml: i18n.t('backend:email.step_up.text', { lng, appName }),
      endingHtml: i18n.t('backend:email.step_up.not_you', { lng }),
      supportText: i18n.t('backend:email.support_email', { lng }),
      code,
    };
  },
  component({ previewText, headerHtml, hiText, bodyHtml, endingHtml, code, supportText, frame }) {
    return (
      <EmailLayout frame={frame} previewText={previewText} headerHtml={headerHtml} endingHtml={endingHtml} supportText={supportText}>
        {hiText && <EmailText style={greetingStyle}>{hiText}</EmailText>}
        <EmailText>
          <SafeHtml html={bodyHtml} policy="inline" />
        </EmailText>
        <EmailText style={codeStyle}>{code}</EmailText>
      </EmailLayout>
    );
  },
  requestDetails: true,
  preview: { statics: { code: '482913', name: 'Emily' }, recipient: {} },
});
