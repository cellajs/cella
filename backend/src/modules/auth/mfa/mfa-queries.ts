import { sql } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import { passkeysTable } from '#/modules/auth/passkeys/passkeys-db';
import { totpsTable } from '#/modules/auth/totps/totps-db';

interface GetHeldFactorsOpts {
  userId: string;
}

/**
 * Which second factors the user holds, in one query. Inside `mfaFactorRules.locked`, pass its transaction so the read
 * sees the change made there.
 */
export const getHeldFactors = async (ctx: DbContext, { userId }: GetHeldFactorsOpts) => {
  const { rows } = await ctx.var.db.execute<{ passkey: boolean; totp: boolean }>(sql`
    select exists (select 1 from ${passkeysTable} where ${passkeysTable.userId} = ${userId}) as passkey,
      exists (select 1 from ${totpsTable} where ${totpsTable.userId} = ${userId}) as totp`);
  return rows[0];
};
