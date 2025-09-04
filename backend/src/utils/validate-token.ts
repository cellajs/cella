import { db } from '#/db/db';
import { type TokenModel, tokensTable } from '#/db/schema/tokens';
import { AppError } from '#/lib/errors';
import { isExpiredDate } from '#/utils/is-expired-date';
import { and, eq, isNull } from 'drizzle-orm';

type BaseProps = { requiredType: TokenModel['type'] };
type FokenInedtifierProps = { token: string; tokenId?: never } | { tokenId: string; token?: never };

export const getValidToken = async ({ token, tokenId, requiredType }: BaseProps & FokenInedtifierProps): Promise<TokenModel> => {
  const condition = [
    isNull(tokensTable.consumedAt),
    eq(tokensTable.type, requiredType),
    ...(token ? [eq(tokensTable.token, token)] : []),
    ...(tokenId ? [eq(tokensTable.id, tokenId)] : []),
  ];

  const [tokenRecord] = await db
    .select()
    .from(tokensTable)
    .where(and(...condition))
    .limit(1);

  const meta = { requiredType };

  if (!tokenRecord) throw new AppError({ status: 404, type: `${requiredType}_not_found`, severity: 'warn', meta });

  if (isExpiredDate(tokenRecord.expiresAt)) throw new AppError({ status: 401, type: `${requiredType}_expired`, severity: 'warn', meta });

  if (tokenRecord.type !== requiredType) throw new AppError({ status: 401, type: 'invalid_token', severity: 'warn', meta });

  await db.update(tokensTable).set({ consumedAt: new Date() }).where(eq(tokensTable.id, tokenRecord.id));
  return tokenRecord;
};
