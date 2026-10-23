import { queryOptions } from '@tanstack/react-query';
import { fromBase64UrlEncoded, toBase64UrlEncoded } from 'lib0/buffer';
import { getYjsToken, pullYjsDocument, pushYjsUpdate } from 'sdk';
import type { ProductEntityType } from 'shared';
import { ApiError } from '~/lib/api';
import type { YjsDocScope } from '~/query/local-user-db';

/** A token lives five minutes and the relay closes its socket then; refetching at four keeps a fresh one ready for the reconnect. */
const yjsTokenRefetchMs = 4 * 60 * 1000;

export const yjsTokenKeys = { entity: (entityType: ProductEntityType, entityId: string) => ['yjs', 'token', entityType, entityId] as const };

/**
 * Why the backend will not issue a token, which no retry changes: `denied` for a 403, the caller may not edit the
 * entity; `deleted` for a 404, the entity is gone. Null for any other error.
 */
export const yjsTokenRefusal = (error: unknown) => {
  if (!(error instanceof ApiError)) return null;
  if (error.status === 404) return 'deleted';
  return error.status === 403 ? 'denied' : null;
};

/** The Yjs token for one entity, refreshed before it expires. */
export const yjsTokenQueryOptions = ({ entityType, entityId, tenantId, organizationId }: YjsDocScope) =>
  queryOptions({
    queryKey: yjsTokenKeys.entity(entityType, entityId),
    queryFn: async () => {
      const { token } = await getYjsToken({ path: { tenantId, organizationId }, query: { entityType, entityId } });
      return token;
    },
    staleTime: yjsTokenRefetchMs,
    refetchInterval: yjsTokenRefetchMs,
    refetchIntervalInBackground: true,
    // Overrides the app-wide `false`: backgrounded tabs throttle the interval, so refetch on focus when stale.
    refetchOnWindowFocus: true,
    retry: (count, error) => !yjsTokenRefusal(error) && count < 3,
    // A bearer token, never persisted; no global error toast, since collaborative mode stays disabled on failure.
    meta: { persist: false, suppressGlobalErrorToast: true },
  });

/** What the server holds of a document that `stateVector` lacks, with the document's generation and the server's state vector. */
export const pullYjsDiff = async ({ entityType, entityId, tenantId, organizationId }: YjsDocScope, stateVector: Uint8Array) => {
  const body = { entityType, entityId, stateVector: toBase64UrlEncoded(stateVector) };
  const answer = await pullYjsDocument({ path: { tenantId, organizationId }, body });
  return { generation: answer.generation, update: fromBase64UrlEncoded(answer.update), stateVector: fromBase64UrlEncoded(answer.stateVector) };
};

/** Appends one update of at most 512 KB, made in `generation`; resolves once the server holds it. */
export const pushYjsDiff = async ({ entityType, entityId, tenantId, organizationId }: YjsDocScope, generation: string, update: Uint8Array) => {
  const body = { entityType, entityId, generation, update: toBase64UrlEncoded(update) };
  await pushYjsUpdate({ path: { tenantId, organizationId }, body });
};
