import type { DbContext } from '#/core/context';
import { AppError } from '#/core/error';
import { type FindConnectionsClaimingOpts, findConnectionsClaiming } from '#/modules/connections/connections-queries';

/**
 * Refuses claim values another SSO connection of the federation already accepts: a domain names one institution, so
 * one connection.
 * @throws AppError 409 `resource_already_exists` with the values in `meta.claimValues`.
 */
export async function assertClaimValuesFree(ctx: DbContext, opts: FindConnectionsClaimingOpts): Promise<void> {
  const taken = await findConnectionsClaiming(ctx, opts);
  if (taken.length) throw new AppError(409, 'resource_already_exists', 'warn', { meta: { resource: 'connection', claimValues: opts.claimValues } });
}
