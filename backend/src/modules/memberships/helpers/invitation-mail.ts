import { appConfig, type ChannelEntityType, type EntityRole } from 'shared';
import type { DbContext } from '#/core/context';
import { mailer } from '#/lib/mailer';
import { tokenLinkUrl } from '#/modules/auth/tokens/token-policies';
import { findAccountLanguages } from '#/modules/memberships/memberships-queries';
import { slugFromEmail } from '#/utils/slug-from-email';
import { memberAddedEmail, memberInviteEmail, memberInviteWithTokenEmail, systemInviteEmail } from '../../../../emails';

export interface InvitedAddress {
  email: string;
  /** The account holding the address, when one does: it reads the mail in its own language. */
  userId?: string | null;
  /** The token minted for an address without an account: the mail carries its link. */
  rawToken?: string;
}

interface InvitationMailOpts {
  /** The inviter: named in the mail, and replies reach them. */
  sender: { name: string; email?: string };
  /** The invited channel and role; a system invitation names none. */
  channel?: { type: ChannelEntityType; slug: string; name: string; role: EntityRole };
  /** Whose default language an address without an account reads. */
  organization?: { defaultLanguage: string } | null;
  /** Addresses invited: a pending invitation each. */
  invited: InvitedAddress[];
  /** Accounts made members at once. */
  added?: InvitedAddress[];
}

/**
 * Sends the invitation mails, built in one place. The link is the invitation token's for an address without an
 * account, else the invited channel's page. The language is the account's own when the address has one, else the
 * organization's default, else the app's.
 */
export async function sendInvitationMails(ctx: DbContext, opts: InvitationMailOpts): Promise<void> {
  const { sender, channel, organization, invited, added = [] } = opts;

  const languages = await findAccountLanguages(ctx, { userIds: [...invited, ...added].flatMap(({ userId }) => (userId ? [userId] : [])) });
  const recipient = ({ email, userId }: InvitedAddress) => ({
    email,
    lng: (userId && languages.get(userId)) || organization?.defaultLanguage || appConfig.defaultLanguage,
    name: slugFromEmail(email),
  });
  const withToken = invited.flatMap((address) =>
    address.rawToken ? [{ ...recipient(address), inviteLink: tokenLinkUrl('invitation', address.rawToken) }] : [],
  );
  const senderProps = { senderName: sender.name };

  if (!channel) {
    if (withToken.length) await mailer.prepareEmails(systemInviteEmail, senderProps, withToken, sender.email);
    return;
  }

  const statics = { ...senderProps, entityName: channel.name, role: channel.role };
  const page = `${appConfig.frontendUrl}/${channel.type}/${channel.slug}`;
  const withoutToken = invited.flatMap((address) => (address.rawToken ? [] : [{ ...recipient(address), memberInviteLink: page }]));
  const addedRecipients = added.map((address) => ({ ...recipient(address), entityLink: page }));

  if (withToken.length) await mailer.prepareEmails(memberInviteWithTokenEmail, statics, withToken, sender.email);
  if (withoutToken.length) await mailer.prepareEmails(memberInviteEmail, statics, withoutToken, sender.email);
  if (addedRecipients.length) await mailer.prepareEmails(memberAddedEmail, statics, addedRecipients, sender.email);
}
