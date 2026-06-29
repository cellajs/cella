import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { findPageById } from '#/modules/page/page-queries';
import { withAuditUser } from '#/modules/user/helpers/audit-user';

export async function getPageOp(ctx: AuthContext, id: string) {
  const pageRecord = await findPageById(ctx, { id });
  if (!pageRecord) throw new AppError(404, 'not_found', 'warn', { entityType: 'page' });
  return withAuditUser(ctx, pageRecord);
}
