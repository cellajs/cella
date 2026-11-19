import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { connectionPublicJwk } from '#/modules/auth/flows/lti/helpers/connection-key';
import { findConnectionById } from '#/modules/connections/connections-queries';

const dbCtx = { var: { db: baseDb } };

/**
 * The key set of one LTI connection: the public half of its own key, also while it is pending its platform's answer.
 * @throws AppError 404 `not_found` for no LTI connection of that id, deleted ones included, or one without a key.
 */
export async function getLtiKeySetOp(connectionId: string) {
  const connection = await findConnectionById(dbCtx, { id: connectionId });
  const jwk = connection?.kind === 'lti' ? connectionPublicJwk(connection) : null;
  if (!jwk) throw new AppError(404, 'not_found', 'info', { meta: { resource: 'ltiKeySet' } });
  return { keys: [jwk] };
}
