import { appConfig } from 'shared';
import { nanoid } from 'shared/utils/nanoid';
import type { DbContext } from '#/core/context';
import { AppError } from '#/core/error';
import { mailer } from '#/lib/mailer';
import { findInactiveMembershipById, insertInvitationToken } from '#/modules/auth/auth-queries';
import type { UnsafeTokenModel } from '#/modules/auth/tokens-db';
import { resolveEntity } from '#/modules/entities/entities-queries';
import { findUserById } from '#/modules/user/user-queries';
import { hashToken } from '#/utils/hash-token';
import { log } from '#/utils/logger';
import { slugFromEmail } from '#/utils/slug-from-email';
import { createDate, TimeSpan } from '#/utils/time-span';
import { memberInviteWithTokenEmail, systemInviteEmail } from '../../../../../emails';

/**
 * Re-issues an invitation from an existing token row: mints a fresh 7-day token copying the old row's linkage, then sends the
 * matching email (membership invite when the token binds a pending membership, system invite otherwise).
 * Callers do token resolution and authorization themselves.
 */
export const resendInvitationEmail = async (ctx: DbContext, oldToken: UnsafeTokenModel): Promise<void> => {
  const { email: userEmail } = oldToken;

  // Generate token and store hashed
  const newToken = nanoid(40);
  const hashedToken = hashToken(newToken);

  await insertInvitationToken(ctx, {
    values: {
      ...oldToken,
      secret: hashedToken,
      expiresAt: createDate(new TimeSpan(7, 'd')),
      invokedAt: null,
      singleUseToken: null,
    },
  });

  const recipient = {
    email: userEmail,
    lng: appConfig.defaultLanguage,
    name: slugFromEmail(userEmail),
    inviteLink: `${appConfig.backendAuthUrl}/invoke-token/${oldToken.type}/${newToken}`,
  };

  // Default props are the system invite
  const defaultEmailProps = {
    senderName: 'System',
    senderThumbnailUrl: null as string | null,
  };

  if (oldToken.createdBy) {
    const sender = await findUserById(ctx, { id: oldToken.createdBy });
    if (sender) {
      defaultEmailProps.senderName = sender.name;
      defaultEmailProps.senderThumbnailUrl = sender.thumbnailUrl;
    }
  }

  if (oldToken.inactiveMembershipId) {
    const inactiveMembership = await findInactiveMembershipById(ctx, {
      id: oldToken.inactiveMembershipId,
    });

    const entityIdColumnKey = appConfig.entityIdColumnKeys[
      inactiveMembership.channelType
    ] as keyof typeof inactiveMembership;
    if (!inactiveMembership[entityIdColumnKey]) throw new AppError(400, 'invalid_request', 'error');
    // Internal resolve: getting entity info for email template (no permission check needed)
    const entity = await resolveEntity(ctx, {
      entityType: inactiveMembership.channelType,
      identifier: inactiveMembership[entityIdColumnKey] as string,
    });

    if (!entity) throw new AppError(400, 'invalid_request', 'error');

    const emailProps = {
      ...defaultEmailProps,
      entityName: entity.name,
      role: inactiveMembership.role,
    };

    const recipientLng = 'defaultLanguage' in entity ? entity.defaultLanguage : appConfig.defaultLanguage;
    await mailer.prepareEmails(
      memberInviteWithTokenEmail,
      emailProps,
      [{ ...recipient, lng: recipientLng }],
      userEmail,
    );
    log.info('Membership invitation has been resent', { [entityIdColumnKey]: entity.id });
  } else {
    await mailer.prepareEmails(systemInviteEmail, defaultEmailProps, [recipient], userEmail);
    log.info('System invitation has been resent');
  }
};
