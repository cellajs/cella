import { appConfig } from 'shared';
import { baseDb } from '#/db/db';
import { isFederationConfigured, isFederationKey } from '#/modules/auth/sso/helpers/federations';
import { findActiveSsoFederations } from '#/modules/connections/connections-queries';

const dbCtx = { var: { db: baseDb } };

/** The federations the generic entrance offers: this deployment holds a client for them and an institution is connected. */
export const listSignInFederations = async () => {
  if (!appConfig.enabledAuthStrategies.includes('sso')) return [];
  const active = await findActiveSsoFederations(dbCtx);
  return active
    .filter((key) => isFederationKey(key) && isFederationConfigured(key))
    .map((key) => ({ key, label: appConfig.federations[key as keyof typeof appConfig.federations].label }));
};
