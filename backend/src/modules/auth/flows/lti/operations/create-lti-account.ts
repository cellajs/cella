import { generateId } from 'shared/utils/entity-id';
import { nanoid } from 'shared/utils/nanoid';
import type { DbContext } from '#/core/context';
import type { ActorId, UserId } from '#/db/utils/ids';
import { updateStamps } from '#/db/utils/stamps';
import { i18n } from '#/lib/i18n';
import { insertAnonymousUser } from '#/modules/auth/core/anonymous/anonymous-account';
import { findPasskeyCredentialsByUser } from '#/modules/auth/flows/passkeys/passkeys-queries';
import type { LtiConnection } from '#/modules/connections/connections-db';
import { countUserIdentities, insertIdentity } from '#/modules/user/identities-queries';
import { findUserById, isProvenAccount, updateUser } from '#/modules/user/user-queries';
import { log } from '#/utils/logger';

/** A person as a platform names them: the id a launch sends as `sub`, and what it released of them. */
export interface LtiPerson {
  sub: string;
  name?: string;
  givenName?: string;
  familyName?: string;
  email?: string;
}

/** The name a platform released for a person, whole or from its parts; undefined when it released none. */
const releasedName = ({ name, givenName, familyName }: LtiPerson) => name ?? ([givenName, familyName].filter(Boolean).join(' ') || undefined);

/** The name of an account made before the platform released one. */
const placeholderName = () => i18n.t('c:anonymous');

interface CreateLtiAccountOpts {
  connection: LtiConnection;
  person: LtiPerson;
  /** When the person signed in with the launch that makes the account, the proof of its identity; absent for one a member import makes. */
  signedInAt?: string;
}

/**
 * Makes the account of a person a platform names for the first time, with the `lti` identity (the connection's
 * tenant, the platform's issuer and `sub`) that finds it again: without a proven address, as an anonymous account is made, named as the platform
 * released it. An email is a display snapshot on the identity and never links an account. A launch and a member import
 * call it under `lockIdentityKey` of that identity, once they found none.
 */
export const createLtiAccount = async (ctx: DbContext, { connection, person, signedInAt }: CreateLtiAccountOpts): Promise<UserId> => {
  const { sub, givenName, familyName } = person;
  const user = await insertAnonymousUser(ctx, {
    id: generateId(),
    name: releasedName(person) ?? placeholderName(),
    slug: `lti-${nanoid(10)}`,
    givenName,
    familyName,
  });
  await insertIdentity(ctx, {
    values: {
      userId: user.id,
      kind: 'lti',
      tenantId: connection.tenantId,
      provider: connection.issuer,
      subject: sub,
      email: person.email ?? null,
      connectionId: connection.id,
      verifiedAt: signedInAt ?? null,
      lastSignInAt: signedInAt ?? null,
    },
  });
  log.info('User provisioned through LTI', { userId: user.id, connectionId: connection.id, launched: !!signedInAt });
  return user.id;
};

/**
 * Gives an account a launch or an import made the name the platform releases later. Only an account that still holds
 * the placeholder and nothing that makes it someone's own takes it: no proven address, no passkey and no identity but
 * its `lti` one. Any other account keeps the name it has.
 */
export const nameLtiAccount = async (ctx: DbContext, { userId, person, by }: { userId: UserId; person: LtiPerson; by: ActorId }) => {
  const name = releasedName(person);
  if (!name || (await findUserById(ctx, { id: userId }))?.name !== placeholderName()) return;
  if (await isProvenAccount(ctx, { userId })) return;
  if ((await findPasskeyCredentialsByUser(ctx, { userId })).length || (await countUserIdentities(ctx, { userId })) > 1) return;
  await updateUser(ctx, { id: userId, values: { name, givenName: person.givenName, familyName: person.familyName, ...updateStamps(by) } });
  log.info('LTI account named', { userId });
};
