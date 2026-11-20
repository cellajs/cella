import { baseDb } from '#/db/db';
import { rotatedConnectionKeys } from '#/modules/auth/flows/lti/helpers/connection-key';
import { connectionServiceAccountId } from '#/modules/auth/flows/lti/operations/connection-service-account';
import { isLtiConnection } from '#/modules/connections/connections-db';
import { findConnectionById, findKeyedLtiConnectionIds, lockConnection, updateConnectionKeys } from '#/modules/connections/connections-queries';
import { log } from '#/utils/logger';

/**
 * Takes one LTI connection's keys a rotation step on when one is due, written as the connection's service account. The
 * row stays locked from its read to its write: of two rotations at once, the second reads what the first wrote and
 * finds no step due. A next key, once published, is never replaced.
 */
const rotateConnectionKeys = (id: string) =>
  baseDb.transaction(async (tx) => {
    const ctx = { var: { db: tx } };
    if (!(await lockConnection(ctx, { id }))) return;
    const connection = await findConnectionById(ctx, { id });
    if (!connection || !isLtiConnection(connection)) return;
    const privateJwk = await rotatedConnectionKeys(connection);
    if (!privateJwk) return;
    const by = await connectionServiceAccountId(ctx, connection);
    if (!by) return;
    await updateConnectionKeys(ctx, { id, privateJwk, by });
    log.info('LTI connection keys rotated', { connectionId: id });
  });

/** The key rotation of every registered LTI connection, a cron job: a connection whose step fails is logged, and the others go on. */
export async function rotateLtiConnectionKeys() {
  for (const id of await findKeyedLtiConnectionIds({ var: { db: baseDb } })) {
    await rotateConnectionKeys(id).catch((err: unknown) => log.error('LTI connection key rotation failed', { connectionId: id, err }));
  }
}
