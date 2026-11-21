import type { z } from '@hono/zod-openapi';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { decodeLaunchState, ltiStorageKey } from '#/modules/auth/flows/lti/helpers/launch-state';
import type { StorageExchange } from '#/modules/auth/flows/lti/helpers/platform-storage-pages';
import type { ltiLaunchFormSchema } from '#/modules/auth/flows/lti/lti-schema';
import { isLtiConnection } from '#/modules/connections/connections-db';
import { findConnectionById } from '#/modules/connections/connections-queries';
import { log } from '#/utils/logger';

const dbCtx = { var: { db: baseDb } };

/**
 * A platform's launch post (1EdTech Security Framework 1.1, section 5.1.1.3). It acts on nothing: it answers the
 * exchange that reads the login's value back from the frame's own storage, or else from platform storage, and posts
 * it, with the ID token and the state, same-origin to the finish route, which checks them all. The state names the
 * connection whose platform answers.
 * @throws AppError 401 `lti_platform_unknown` for a state of no active LTI connection, 401 `lti_launch_invalid` when
 *   the platform posted an error or no ID token.
 */
export async function receiveLtiLaunchOp(form: z.infer<typeof ltiLaunchFormSchema>): Promise<StorageExchange> {
  const state = decodeLaunchState(form.state);
  const connection = state && (await findConnectionById(dbCtx, { id: state.connection }));
  if (!state || !connection || !isLtiConnection(connection) || connection.status !== 'active') {
    throw new AppError(401, 'lti_platform_unknown', 'warn', { meta: { issuer: null } });
  }

  if (form.error || !form.id_token || !form.state) {
    log.warn('LTI launch refused by the platform', { connectionId: connection.id, error: form.error ?? null });
    throw new AppError(401, 'lti_launch_invalid', 'warn', { meta: { rule: 'platform_error', connectionId: connection.id } });
  }

  return {
    subject: 'lti.get_data',
    target: state.target,
    origin: new URL(connection.config.authorizationEndpoint).origin,
    pageOrigin: connection.config.pageOrigin,
    key: ltiStorageKey(state.nonce),
    fields: { id_token: form.id_token, state: form.state },
  };
}
