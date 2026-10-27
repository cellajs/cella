import type { EmailFrame } from '../frame';
import { avatarRowStyle, smallTextStyle } from '../styles';
import { EmailAvatar } from './email-avatar';
import { EmailBody } from './email-body';
import { EmailContainer } from './email-container';
import { EmailFooter } from './email-footer';
import { EmailHeader } from './email-header';
import { EmailLogo } from './email-logo';
import { EmailRequestDetails } from './email-request-details';
import { EmailText } from './email-text';
import { Column, Link, Row } from './primitives';
import { SafeHtml } from './safe-html';

export interface EmailLayoutProps {
  previewText: string;
  /** Translated HTML: the i18n instance escaped every interpolated value. */
  headerHtml?: string;
  /** Drawn as an initials avatar above the header. */
  avatarName?: string;
  /** Widens the column for long content, such as a newsletter or a digest. */
  wide?: boolean;
  headChildren?: React.ReactNode;
  /** Rendered as the last line of the body panel. */
  unsubscribe?: { label: string; href: string };
  supportText: string;
  /**
   * Translated HTML under the body's divider, after any request details: what a reader does when the mail was not their
   * doing, or who sent it and how to reach them.
   */
  endingHtml?: string;
  frame: EmailFrame;
  children: React.ReactNode;
}

/** The frame every email shares: optional avatar and header, the body panel, logo and footer. */
export const EmailLayout = ({
  previewText,
  headerHtml,
  avatarName,
  wide,
  headChildren,
  unsubscribe,
  supportText,
  endingHtml,
  frame,
  children,
}: EmailLayoutProps) => (
  <EmailContainer previewText={previewText} containerStyle={wide ? { maxWidth: '40rem' } : undefined} headChildren={headChildren}>
    {avatarName && (
      <Row style={avatarRowStyle}>
        <Column align="center">
          <EmailAvatar name={avatarName} type="user" />
        </Column>
      </Row>
    )}
    {headerHtml && <EmailHeader headerText={<SafeHtml html={headerHtml} policy="inline" as="div" />} />}
    <EmailBody>
      {children}
      {(frame.requestDetails || endingHtml) && (
        <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #eaeaea' }}>
          {frame.requestDetails && <EmailRequestDetails rows={frame.requestDetails} />}
          {endingHtml && (
            <EmailText className="email-ending" style={{ ...smallTextStyle, color: '#666', margin: frame.requestDetails ? '0.5rem 0 0' : 0 }}>
              <SafeHtml html={endingHtml} policy="inline" />
            </EmailText>
          )}
        </div>
      )}
      {unsubscribe && (
        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <Link style={smallTextStyle} href={unsubscribe.href}>
            {unsubscribe.label}
          </Link>
        </div>
      )}
    </EmailBody>
    <EmailLogo />
    <EmailFooter supportText={supportText} sentTo={frame.sentTo} />
  </EmailContainer>
);
