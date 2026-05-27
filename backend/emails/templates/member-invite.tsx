import { Column, Row } from 'jsx-email';
import { appConfig, type EntityRole } from 'shared';
import {
  EmailAvatar,
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
import { avatarRowStyle, greetingStyle } from '../styles';
import { defineEmailTemplate, type EmailRecipient } from '../types';

interface MemberInviteStatic {
  senderName: string;
  senderThumbnailUrl: string | null;
  entityName: string;
  role: EntityRole;
}

type MemberInviteRecipient = EmailRecipient & { name: string; memberInviteLink: string };

const appName = appConfig.name;

/**
 * Email template for existing users that receive a new membership invitation.
 */
export const memberInviteEmail = defineEmailTemplate<MemberInviteStatic, MemberInviteRecipient>()({
  translate(lng, { senderName, senderThumbnailUrl, entityName, role }) {
    return {
      subject: i18n.t('backend:email.member_invite.subject', { lng, entityName }),
      previewText: i18n.t('backend:email.member_invite.preview', { lng, entityName, appName }),
      headerHtml: i18n.t('backend:email.member_invite.title', { lng, entityName }),
      hiText: i18n.t('backend:email.hi', { lng, name: '{{params.name}}' }),
      bodyHtml: i18n.t('backend:email.member_invite.text', { lng, entityName, appName, senderName, role }),
      buttonText: i18n.t('c:accept', { lng }),
      supportText: i18n.t('backend:email.support_email', { lng }),
      senderName,
      senderThumbnailUrl,
    };
  },
  component({
    previewText,
    headerHtml,
    hiText,
    bodyHtml,
    buttonText,
    supportText,
    senderName,
    name,
    memberInviteLink,
  }) {
    return (
      <EmailContainer previewText={previewText}>
        {senderName && (
          <Row style={avatarRowStyle}>
            <Column align="center">
              <EmailAvatar name={senderName} type="user" />
            </Column>
          </Row>
        )}

        <EmailHeader headerText={<SafeHtml html={headerHtml} policy="inline" as="div" />} />
        <EmailBody>
          {name && <EmailText style={greetingStyle}>{hiText}</EmailText>}
          <EmailText>
            <SafeHtml html={bodyHtml} policy="inline" />
          </EmailText>

          <EmailButton ButtonText={buttonText} href={memberInviteLink} />
        </EmailBody>

        <EmailLogo />
        <EmailFooter supportText={supportText} />
      </EmailContainer>
    );
  },
});
