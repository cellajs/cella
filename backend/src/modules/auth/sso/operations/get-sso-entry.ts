import { appConfig } from 'shared';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { isFederationKey } from '#/modules/auth/sso/helpers/federations';
import { findConnectionEntry } from '#/modules/connections/connections-queries';

const dbCtx = { var: { db: baseDb } };

/**
 * What the entry page of a connection shows. Public: the id is the link an institution shares, and the page says only
 * what the sign-in itself would reveal.
 * @throws AppError 404 `not_found` for an unknown connection or one that is not an SSO connection of a known federation.
 */
export const getSsoEntryOp = async (connectionId: string) => {
  const entry = await findConnectionEntry(dbCtx, { id: connectionId });
  const connection = entry?.connection;
  if (!entry || !connection || connection.kind !== 'sso' || !isFederationKey(connection.issuer)) {
    throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'connection' } });
  }

  return {
    id: connection.id,
    status: connection.status,
    federation: { key: connection.issuer, label: appConfig.federations[connection.issuer].label },
    institution: { displayName: connection.displayName, logoUrl: connection.config.logoUrl ?? null },
    organization: entry.organization,
  };
};
