import { appConfig } from 'shared';
import type { ContextEntityIdColumns } from 'shared';

/**
 * ID column keys for every context entity type (e.g. `['organizationId']`),
 * precomputed once from config.
 *
 * The context-column iteration pattern ("for each context entity type, read its
 * ID column off a row or activity") recurs in the activity builder, the
 * transaction buffer, and the delta planner. Sharing the key list keeps those in
 * lockstep with `appConfig.contextEntityTypes`.
 */
export const contextIdColumnKeys = appConfig.contextEntityTypes.map(
  (type) => appConfig.entityIdColumnKeys[type],
) as ReadonlyArray<keyof ContextEntityIdColumns>;
