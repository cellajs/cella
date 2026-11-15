import { type AuthStrategy, baseAuthStrategies } from 'shared';
import { federationKeys } from '#/modules/auth/core/federations/federation-keys';

/**
 * Every {@link AuthStrategy}: the enum of the columns and request fields that hold one. Built when the backend loads, so
 * a federation the test setup adds to the config is in.
 */
export const authStrategiesEnum = [...baseAuthStrategies, ...federationKeys] as const;
