import { appConfig, type ChannelEntityType, type EntityRole } from 'shared';
import type { DbContext } from '#/core/context';
import { mailer } from '#/lib/mailer';
import { tokenLinkUrl } from '#/modules/auth/tokens/token-policies';
import { findAccountNamesAndLanguages } from '#/modules/memberships/memberships-queries';
import { log } from '#/utils/logger';
import { displayNameFromEmail } from '#/utils/slug';
import { memberAddedEmail, memberInviteEmail, memberInviteWithTokenEmail, systemInviteEmail } from '../../../../emails';

/** An address an invitation mail goes to. */
export interface InvitedAddress {
  email: string;
  /** The account holding the address, when one does: it reads the mail in its own language. */
  userId?: string | null;
  /** The token minted for an address without an account: the mail carries its link. */
  rawToken?: string;
}

interface InvitationMailOpts {
  /** The inviter: named in the mail, and replies reach them. Without one the mail comes from the system. */
  sender?: { name: string; email?: string };
  /** The invited channel and role; a system invitation names none. */
  channel?: { type: ChannelEntityType; slug: string; name: string; role: EntityRole };
  /** Whose default language an address without an account reads; a mail about a channel below it names it. */
  organization?: { defaultLanguage: string; name: string } | null;
  /** Addresses invited: a pending invitation each. */
  invited: InvitedAddress[];
  /** Accounts made members at once. */
  added?: InvitedAddress[];
}

/**
 * Sends the invitation mails, built in one place. The link is the invitation token's for an address without an
 * account, else the invited channel's page. The language is the account's own when the address has one, else the
 * organization's default, else the app's. A mail greets an account by its name, and an address without one by none.
 * @returns Whether every mail went out. A failed send is logged, since every caller stored its rows before the mail and
 *   records the mail only once it went out; a failed render still throws.
 */
export async function sendInvitationMails(ctx: DbContext, opts: InvitationMailOpts): Promise<boolean> {
  const { sender = { name: 'System' }, channel, organization, invited, added = [] } = opts;

  const userIds = [...invited, ...added].flatMap(({ userId }) => (userId ? [userId] : []));
  const accounts = await findAccountNamesAndLanguages(ctx, { userIds });
  const lng = (userId?: string | null) => (userId && accounts.get(userId)?.language) || organization?.defaultLanguage || appConfig.defaultLanguage;
  // An account removed after the invitation was planned leaves its address to name it.
  const accountHolder = ({ email, userId }: InvitedAddress) => ({
    email,
    lng: lng(userId),
    name: (userId && accounts.get(userId)?.name) || displayNameFromEmail(email),
  });
  const withToken = invited.flatMap(({ email, userId, rawToken }) =>
    rawToken ? [{ email, lng: lng(userId), inviteLink: tokenLinkUrl('invitation', rawToken) }] : [],
  );
  const senderProps = { senderName: sender.name, senderEmail: sender.email };
  let sent = true;
  const logFailure = (err: unknown) => {
    if (!(err instanceof AggregateError)) throw err;
    log.error('Failed to send invitation mails', { err });
    sent = false;
  };

  if (!channel) {
    if (withToken.length) await mailer.sendEmails(systemInviteEmail, senderProps, withToken, sender.email).catch(logFailure);
    return sent;
  }

  const organizationName = channel.type === 'organization' ? undefined : organization?.name;
  const statics = { ...senderProps, entityName: channel.name, organizationName, role: channel.role };
  const page = `${appConfig.frontendUrl}/${channel.type}/${channel.slug}`;
  const withoutToken = invited.flatMap((address) => (address.rawToken ? [] : [{ ...accountHolder(address), memberInviteLink: page }]));
  const addedRecipients = added.map((address) => ({ ...accountHolder(address), entityLink: page }));

  if (withToken.length) await mailer.sendEmails(memberInviteWithTokenEmail, statics, withToken, sender.email).catch(logFailure);
  if (withoutToken.length) await mailer.sendEmails(memberInviteEmail, statics, withoutToken, sender.email).catch(logFailure);
  if (addedRecipients.length) await mailer.sendEmails(memberAddedEmail, statics, addedRecipients, sender.email).catch(logFailure);
  return sent;
}
