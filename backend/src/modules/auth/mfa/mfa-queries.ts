import { sql } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import { passkeysTable } from '#/modules/auth/passkeys/passkeys-db';
import { totpsTable } from '#/modules/auth/totps/totps-db';
import { usersTable } from '#/modules/user/user-db';

/**
 * Whether the user holds a passkey and an authenticator app, as two boolean SQL expressions. The user id is a
 * parameter, so they read the same in any select.
 */
export const heldFactorsSql = (userId: string) => ({
  passkey: sql<boolean>`exists (select 1 from ${passkeysTable} where ${passkeysTable.userId} = ${userId})`,
  totp: sql<boolean>`exists (select 1 from ${totpsTable} where ${totpsTable.userId} = ${userId})`,
});

interface FindHeldFactorsOpts {
  userId: string;
}

/**
 * Which second factors the user holds and whether MFA is on (null for a user that is gone), in one query. Inside
 * `mfaFactorRules.locked`, pass the context it hands over, so the read sees the change made there.
 */
export const findHeldFactors = async (ctx: DbContext, { userId }: FindHeldFactorsOpts) => {
  const held = heldFactorsSql(userId);
  const { rows } = await ctx.var.db.execute<{ mfaRequired: boolean | null; passkey: boolean; totp: boolean }>(sql`
    select (select ${usersTable.mfaRequired} from ${usersTable} where ${usersTable.id} = ${userId}) as "mfaRequired",
      ${held.passkey} as passkey,
      ${held.totp} as totp`);
  return rows[0];
};
