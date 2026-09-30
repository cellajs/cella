import { greetingStyle, noteStyle } from '../styles';
import { EmailButton } from './email-button';
import { EmailLayout, type EmailLayoutProps } from './email-layout';
import { EmailText } from './email-text';
import { SafeHtml } from './safe-html';

interface EmailMessageProps extends Omit<EmailLayoutProps, 'children'> {
  /** Left out when empty. */
  greeting?: string;
  /** Translated HTML: the i18n instance escaped every interpolated value. */
  bodyHtml: string;
  /** Plain-text fine print under the action, such as when a link expires. */
  note?: string;
  action?: { label: string; href: string };
}

/** The standard transactional email: greeting, one translated paragraph, an optional action and a note. */
export const EmailMessage = ({ greeting, bodyHtml, note, action, ...layout }: EmailMessageProps) => (
  <EmailLayout {...layout}>
    {greeting && <EmailText style={greetingStyle}>{greeting}</EmailText>}
    <EmailText>
      <SafeHtml html={bodyHtml} policy="inline" />
    </EmailText>
    {action && <EmailButton ButtonText={action.label} href={action.href} />}
    {note && <EmailText style={noteStyle}>{note}</EmailText>}
  </EmailLayout>
);
