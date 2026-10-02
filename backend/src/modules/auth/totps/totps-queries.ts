import { and, eq, isNull, lt, or } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import { encryptTotpSecret } from '#/modules/auth/totps/helpers/totp-secret-encryption';
import { totpsTable } from '#/modules/auth/totps/totps-db';

interface FindTotpOpts {
  userId: string;
}

/** The account's authenticator app, with its secret still encrypted; undefined without one. */
export const findTotp = async (ctx: DbContext, { userId }: FindTotpOpts) => {
  const [totp] = await ctx.var.db.select({ secret: totpsTable.secret }).from(totpsTable).where(eq(totpsTable.userId, userId)).limit(1);
  return totp;
};

interface InsertTotpOpts {
  userId: string;
  secret: string;
  /** The time step of the code that confirmed the setup. */
  lastUsedStep: number;
}

export const insertTotp = async (ctx: DbContext, { userId, secret, lastUsedStep }: InsertTotpOpts) => {
  return ctx.var.db.insert(totpsTable).values({ userId, secret: encryptTotpSecret(secret), lastUsedStep });
};

interface UpdateTotpLastUsedStepOpts {
  userId: string;
  step: number;
}

/**
 * Moves the account's last used step forward to `step`; undefined when that step or a later one was used already. Of
 * two checks of one code, exactly one moves it.
 */
export const updateTotpLastUsedStep = async (ctx: DbContext, { userId, step }: UpdateTotpLastUsedStepOpts) => {
  const [spent] = await ctx.var.db
    .update(totpsTable)
    .set({ lastUsedStep: step })
    .where(and(eq(totpsTable.userId, userId), or(isNull(totpsTable.lastUsedStep), lt(totpsTable.lastUsedStep, step))))
    .returning({ id: totpsTable.id });
  return spent;
};

interface DeleteTotpOpts {
  userId: string;
}

export const deleteTotp = async (ctx: DbContext, { userId }: DeleteTotpOpts) => {
  await ctx.var.db.delete(totpsTable).where(eq(totpsTable.userId, userId));
};
