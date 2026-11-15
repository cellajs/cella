import { appConfig, type FederationKey } from 'shared';
import type { FederationConfig } from 'shared/config-builder/types';
import { AppError } from '#/core/error';
import { env } from '#/env';

/** A federation of `appConfig.federations` with the client this deployment registered at it. */
export interface Federation extends FederationConfig {
  key: FederationKey;
  clientId: string;
  clientSecret: string;
  /** One callback for every federation: the state cookie names which one a round trip belongs to. */
  redirectUri: string;
}

/** Whether the key names a federation of `appConfig.federations`; `isFederationConfigured` says whether this deployment holds its client. */
export const isFederationKey = (key: string): key is FederationKey => Object.hasOwn(appConfig.federations, key);

/** The client id and secret of a federation, from `SSO_<KEY>_CLIENT_ID` and `SSO_<KEY>_CLIENT_SECRET`. */
const clientOf = (key: FederationKey) => {
  const values: Record<string, unknown> = env;
  const read = (suffix: string) => {
    const value = values[`SSO_${key.toUpperCase()}_${suffix}`];
    return typeof value === 'string' ? value : undefined;
  };
  return { clientId: read('CLIENT_ID'), clientSecret: read('CLIENT_SECRET') };
};

/** Whether this deployment holds a client for the federation: without one, no connection can be created or used. */
export const isFederationConfigured = (key: FederationKey): boolean => {
  const { clientId, clientSecret } = clientOf(key);
  return !!clientId && !!clientSecret;
};

/**
 * The federation with its client.
 * @throws AppError 400 `sso_not_configured` when the deployment holds no client for it.
 */
export const getFederation = (key: FederationKey): Federation => {
  const { clientId, clientSecret } = clientOf(key);
  if (!clientId || !clientSecret) throw new AppError(400, 'sso_not_configured', 'error', { meta: { strategy: key } });

  return { ...appConfig.federations[key], key, clientId, clientSecret, redirectUri: `${appConfig.backendAuthUrl}/sso/callback` };
};
