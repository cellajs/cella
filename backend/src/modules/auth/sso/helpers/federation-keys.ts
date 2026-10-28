import { appConfig, type FederationKey } from 'shared';

/** Every federation key of `appConfig.federations`, in config order, read when the backend loads (after the test setup adds its own). */
export const federationKeys = Object.keys(appConfig.federations) as FederationKey[];
