import { appConfig } from 'shared';
import welcomeConfig from '../../../json/text-blocks.json';
import { EmailAvatar, EmailBody, EmailContainer, EmailFooter, EmailLogo, EmailText } from '../components';
import { Column, Link, Row } from '../components/primitives';
import i18n from '../i18n';
import { avatarRowStyle, greetingStyle, smallTextStyle } from '../styles';
import { defineEmailTemplate, type EmailRecipient } from '../types';

type WelcomeRecipient = EmailRecipient & { name: string };

const appName = appConfig.name;

/** Replace the {{appName}} placeholder in fork-customizable copy with the app name. */
const withAppName = (text: string) => text.replaceAll('{{appName}}', appName);

const { welcomeEmail } = welcomeConfig;

/**
 * Founder-style welcome email sent to new users.
 *
 * The marketing copy (intro, getting-started steps, P.S., founder details) is
 * fork-customizable in `json/text-blocks.json` under `welcomeEmail`, so forks can
 * tailor the message without touching code or translations.
 */
export const welcomeEmailTemplate = defineEmailTemplate<Record<string, never>, WelcomeRecipient>()({
  translate(lng) {
    return {
      subject: withAppName(welcomeEmail.subject),
      previewText: withAppName(welcomeEmail.subject),
      hiText: i18n.t('backend:email.hi', { lng, name: '{{params.name}}' }),
      intro: welcomeEmail.intro.map(withAppName),
      stepsHeading: withAppName(welcomeEmail.stepsHeading),
      steps: welcomeEmail.steps,
      ps: withAppName(welcomeEmail.ps),
      signOff: withAppName(welcomeEmail.signOff),
      founderName: welcomeEmail.founderName,
      founderRole: withAppName(welcomeEmail.founderRole),
      supportText: i18n.t('backend:email.support_email', { lng }),
    };
  },
  component({
    previewText,
    hiText,
    intro,
    stepsHeading,
    steps,
    ps,
    signOff,
    founderName,
    founderRole,
    supportText,
    name,
  }) {
    return (
      <EmailContainer previewText={previewText}>
        <Row style={avatarRowStyle}>
          <Column align="center">
            <EmailAvatar name={founderName} type="user" />
          </Column>
        </Row>

        <EmailBody>
          {name && <EmailText style={greetingStyle}>{hiText}</EmailText>}

          {intro.map((paragraph) => (
            <EmailText key={paragraph}>{paragraph}</EmailText>
          ))}

          <EmailText style={{ marginTop: '1.5rem' }}>{stepsHeading}</EmailText>
          <ol style={{ paddingLeft: '1.25rem', margin: '0.5rem 0 1.5rem' }}>
            {steps.map((step) => (
              <li key={step.href} style={{ margin: '0.375rem 0' }}>
                <Link href={step.href} style={{ color: '#000', textDecoration: 'underline' }}>
                  {step.label}
                </Link>
              </li>
            ))}
          </ol>

          <EmailText style={smallTextStyle}>{ps}</EmailText>

          <EmailText style={{ marginTop: '1.5rem' }}>{signOff}</EmailText>
          <EmailText style={{ margin: '0' }}>{founderName}</EmailText>
          <EmailText style={{ ...smallTextStyle, margin: '0' }}>
            {founderRole}, {appName}
          </EmailText>
        </EmailBody>

        <EmailLogo />
        <EmailFooter supportText={supportText} />
      </EmailContainer>
    );
  },
  preview: {
    statics: {},
    recipient: { name: 'Emily' },
  },
});
