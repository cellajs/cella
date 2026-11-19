import { generateId } from 'shared/utils/entity-id';
import { nanoid } from 'shared/utils/nanoid';
import type { DbContext } from '#/core/context';
import type { UserId } from '#/db/utils/ids';
import { i18n } from '#/lib/i18n';
import { insertAnonymousUser } from '#/modules/auth/core/anonymous/anonymous-account';
import type { LtiConnection } from '#/modules/connections/connections-db';
import { insertIdentity } from '#/modules/user/identities-queries';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';

/** A person as a platform names them: the id a launch sends as `sub`, and what it released of them. */
export interface LtiPerson {
  sub: string;
  name?: string;
  givenName?: string;
  familyName?: string;
  email?: string;
}

interface CreateLtiAccountOpts {
  connection: LtiConnection;
  person: LtiPerson;
  /** When the person signed in with the launch that makes the account; absent for one a member import makes. */
  signedInAt?: string;
}

/**
 * Makes the account of a person a platform names for the first time, with the `lti` identity (the platform's issuer
 * and `sub`) that finds it again: without a proven address, as an anonymous account is made, named as the platform
 * released it. An email is a display snapshot on the identity and never links an account. A launch and a member import
 * call it under `lockIdentityKey` of that identity, once they found none.
 */
export const createLtiAccount = async (ctx: DbContext, { connection, person, signedInAt }: CreateLtiAccountOpts): Promise<UserId> => {
  const { sub, name: fullName, givenName, familyName } = person;
  const name = fullName ?? ([givenName, familyName].filter(Boolean).join(' ') || i18n.t('c:anonymous'));
  const user = await insertAnonymousUser(ctx, { id: generateId(), name, slug: `lti-${nanoid(10)}`, givenName, familyName });
  await insertIdentity(ctx, {
    values: {
      userId: user.id,
      kind: 'lti',
      provider: connection.issuer,
      subject: sub,
      email: person.email ?? null,
      connectionId: connection.id,
      verifiedAt: signedInAt ?? getIsoDate(),
      lastSignInAt: signedInAt ?? null,
    },
  });
  log.info('User provisioned through LTI', { userId: user.id, connectionId: connection.id, launched: !!signedInAt });
  return user.id;
};
