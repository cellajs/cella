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
import i18n from '../i18n';
import { avatarRowStyle, greetingStyle } from '../styles';
import { defineEmailTemplate, type EmailRecipient } from '../types';

interface MemberAddedStatic {
  senderName: string;
  senderThumbnailUrl: string | null;
  entityName: string;
  role: EntityRole;
}

type MemberAddedRecipient = EmailRecipient & { name: string; entityLink: string };

const appName = appConfig.name;

/**
 * Email template for users directly added to an entity (Scenario 2b).
 * Unlike invite emails, no action is required - the user is already a member.
 */
export const memberAddedEmail = defineEmailTemplate<MemberAddedStatic, MemberAddedRecipient>()({
  translate(lng, { senderName, senderThumbnailUrl, entityName, role }) {
    return {
      subject: i18n.t('backend:email.member_added.subject', { lng, entityName }),
      previewText: i18n.t('backend:email.member_added.preview', { lng, entityName, appName }),
      headerHtml: i18n.t('backend:email.member_added.title', { lng, entityName }),
      hiText: i18n.t('backend:email.hi', { lng, name: '{{params.name}}' }),
      bodyHtml: i18n.t('backend:email.member_added.text', { lng, entityName, appName, senderName, role }),
      buttonText: i18n.t('c:view', { lng }),
      supportText: i18n.t('backend:email.support_email', { lng }),
      senderName,
      senderThumbnailUrl,
    };
  },
  component({ previewText, headerHtml, hiText, bodyHtml, buttonText, supportText, senderName, name, entityLink }) {
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

          <EmailButton ButtonText={buttonText} href={entityLink} />
        </EmailBody>

        <EmailLogo />
        <EmailFooter supportText={supportText} />
      </EmailContainer>
    );
  },
  preview: {
    statics: { senderName: 'John', senderThumbnailUrl: null, entityName: 'Acme', role: 'member' },
    recipient: { name: 'Emily', entityLink: 'https://example.com/acme' },
  },
});
