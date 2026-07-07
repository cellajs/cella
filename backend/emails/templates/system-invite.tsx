import { appConfig } from 'shared';
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

interface SystemInviteStatic {
  senderName: string;
  senderThumbnailUrl: string | null;
}

type SystemInviteRecipient = EmailRecipient & { name: string; inviteLink: string };

const appName = appConfig.name;

/**
 * Email template for new users that receive a system-level invitation.
 */
export const systemInviteEmail = defineEmailTemplate<SystemInviteStatic, SystemInviteRecipient>()({
  translate(lng, { senderName, senderThumbnailUrl }) {
    return {
      subject: i18n.t('backend:email.system_invite.subject', { lng, appName }),
      previewText: i18n.t('backend:email.system_invite.preview', { appName, lng }),
      headerHtml: i18n.t('backend:email.system_invite.title', { appName, lng }),
      hiText: i18n.t('backend:email.hi', { lng, name: '{{params.name}}' }),
      bodyHtml: i18n.t('backend:email.system_invite.text', { lng, appName, senderName }),
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
    statics: { senderName: 'John', senderThumbnailUrl: null },
    recipient: { name: 'Emily', inviteLink: 'https://example.com/invite' },
  },
});
