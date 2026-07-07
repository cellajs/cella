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
import { Column, Row } from '../components/primitives';
import { i18n } from '../i18n';
import { avatarRowStyle, greetingStyle } from '../styles';
import { defineEmailTemplate, type EmailRecipient } from '../types';

interface MemberInviteWithTokenStatic {
  senderName: string;
  senderThumbnailUrl: string | null;
  entityName: string;
  role: EntityRole;
}

type MemberInviteWithTokenRecipient = EmailRecipient & { name: string; inviteLink: string };

const appName = appConfig.name;

/**
 * Email template for new users that receive a new membership invitation with a token.
 */
export const memberInviteWithTokenEmail = defineEmailTemplate<
  MemberInviteWithTokenStatic,
  MemberInviteWithTokenRecipient
>()({
  translate(lng, { senderName, senderThumbnailUrl, entityName, role }) {
    return {
      subject: i18n.t('backend:email.member_invite.subject', { lng, entityName }),
      previewText: i18n.t('backend:email.member_invite.preview', { lng, entityName, appName }),
      headerHtml: i18n.t('backend:email.member_invite.title', { lng, entityName }),
      hiText: i18n.t('backend:email.hi', { lng, name: '{{params.name}}' }),
      bodyHtml: i18n.t('backend:email.member_invite.text', { lng, entityName, appName, senderName, role }),
      inviteExpires: i18n.t('backend:email.invite_expires', { lng }),
      buttonText: i18n.t('c:join', { lng }),
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
    inviteExpires,
    buttonText,
    supportText,
    senderName,
    name,
    inviteLink,
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
            <SafeHtml html={bodyHtml} policy="inline" /> {inviteExpires}
          </EmailText>

          <EmailButton ButtonText={buttonText} href={inviteLink} />
        </EmailBody>

        <EmailLogo />
        <EmailFooter supportText={supportText} />
      </EmailContainer>
    );
  },
  preview: {
    statics: { senderName: 'John', senderThumbnailUrl: null, entityName: 'Acme', role: 'member' },
    recipient: { name: 'Emily', inviteLink: 'https://example.com/invite' },
  },
});
