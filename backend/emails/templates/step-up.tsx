import { appConfig } from 'shared';
import { EmailLayout, EmailText, SafeHtml } from '../components';
import { i18n, plainText } from '../i18n';
import { defineEmailTemplate, type EmailRecipient } from '../types';

const appName = appConfig.name;

interface StepUpStatic {
  code: string;
  name: string;
  /** The asking browser and its OS as sign-in notices name them; empty when the request did not tell. */
  browser: string;
  os: string;
}

// The code stays out of the subject and preview, which lock screens and mail lists show to anyone nearby.
const codeStyle = { fontSize: '1.75rem', fontWeight: 700, letterSpacing: '0.3em', textAlign: 'center', margin: '1.5rem 0' } as const;

export const stepUpEmail = defineEmailTemplate<StepUpStatic, EmailRecipient & { email: string }>()({
  translate(lng, { code, name, browser, os }) {
    return {
      subject: i18n.t('backend:email.step_up.subject', { lng, appName, ...plainText }),
      previewText: i18n.t('backend:email.step_up.preview', { lng, appName, ...plainText }),
      headerHtml: i18n.t('backend:email.step_up.title', { lng, appName }),
      hiText: name ? i18n.t('backend:email.hi', { lng, name, ...plainText }) : '',
      bodyHtml: i18n.t('backend:email.step_up.text', { lng, appName }),
      warning: browser
        ? i18n.t('backend:email.step_up.warning', { lng, browser, os, ...plainText })
        : i18n.t('backend:email.step_up.warning_unknown_browser', { lng, ...plainText }),
      supportText: i18n.t('backend:email.support_email', { lng }),
      code,
    };
  },
  component({ previewText, headerHtml, hiText, bodyHtml, warning, code, supportText }) {
    return (
      <EmailLayout previewText={previewText} headerHtml={headerHtml} supportText={supportText}>
        {hiText && <EmailText>{hiText}</EmailText>}
        <EmailText>
          <SafeHtml html={bodyHtml} policy="inline" />
        </EmailText>
        <EmailText style={codeStyle}>{code}</EmailText>
        <EmailText>{warning}</EmailText>
      </EmailLayout>
    );
  },
  preview: { statics: { code: '482913', name: 'Emily', browser: 'Firefox', os: 'macOS' }, recipient: {} },
});
