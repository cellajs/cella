import { EmailButton, EmailLayout, EmailText } from '../../../../emails/components';
import { greetingStyle } from '../../../../emails/styles';
import type { EmailRecipient, FrameProps } from '../../../../emails/types';

/** Per-recipient props of an instant email about one subject: the mention mail and the comment mail. */
export type SubjectEmailRecipient = EmailRecipient & { name: string; subjectTitle: string; excerpt: string; link: string; unsubscribeLink: string };

interface SubjectEmailProps extends Omit<SubjectEmailRecipient, keyof EmailRecipient>, FrameProps {
  previewText: string;
  hiText: string;
  headerHtml: string;
  inText: string;
  buttonText: string;
  unsubscribeText: string;
  supportText: string;
}

/** The body every instant email shares: where, the subject's title and excerpt, a link and an unsubscribe line. */
export const SubjectEmail = ({
  previewText,
  hiText,
  headerHtml,
  inText,
  buttonText,
  unsubscribeText,
  supportText,
  frame,
  subjectTitle,
  excerpt,
  link,
  unsubscribeLink,
}: SubjectEmailProps) => (
  <EmailLayout
    frame={frame}
    previewText={previewText}
    headerHtml={headerHtml}
    unsubscribe={{ label: unsubscribeText, href: unsubscribeLink }}
    supportText={supportText}
  >
    <EmailText style={greetingStyle}>{hiText}</EmailText>
    <EmailText>{inText}</EmailText>
    <EmailText>
      <strong>{subjectTitle}</strong>
    </EmailText>
    <EmailText>{excerpt}</EmailText>
    <EmailButton ButtonText={buttonText} href={link} />
  </EmailLayout>
);
