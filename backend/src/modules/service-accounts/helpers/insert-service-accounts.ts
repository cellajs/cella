import { generateId } from 'shared/utils/entity-id';
import type { DbOrTx } from '#/db/db';
import { principalsTable } from '#/modules/principals/principals-db';
import {
  type InsertServiceAccountModel,
  type ServiceAccountModel,
  serviceAccountsTable,
} from '#/modules/service-accounts/service-accounts-db';

/** The only way to insert a service account: its `principals` row of kind `service` goes first, in one transaction. */
export async function insertServiceAccount(
  db: DbOrTx,
  record: InsertServiceAccountModel,
): Promise<ServiceAccountModel> {
  const id = record.id ?? generateId();
  return db.transaction(async (tx) => {
    await tx.insert(principalsTable).values({ id, kind: 'service' });
    const [account] = await tx
      .insert(serviceAccountsTable)
      .values({ ...record, id })
      .returning();
    return account;
  });
}
