import { appConfig, EntityType } from 'config';
import { env } from '#/env';
import { AppError } from '#/lib/errors';

/**
 * @see https://github.com/electric-sql/electric/blob/main/packages/typescript-client/src/constants.ts
 */
type ElectricUrlQuery = {
  offset: string;
  live?: string;
  handle?: string;
  cursor?: string;
  where?: string;
};

/**
 * Construct Electric proxy URL using Electric Protocol params
 * @param table
 * @param query
 * @returns {URL} Proxy URL
 */
const prepareElectricUrl = (table: string, query: ElectricUrlQuery): URL => {
  const { offset, live, handle, cursor, where } = query;

  // Construct the upstream URL
  const originUrl = new URL(`${appConfig.electricUrl}/v1/shape`);
  const params = originUrl.searchParams;

  params.set('api_secret', env.ELECTRIC_API_SECRET);
  params.set('table', table);

  // Copy over the relevant query params that the Electric client adds
  // so that we return the right part of the Shape log.
  params.set('offset', offset);
  params.set('live', live ?? 'false');

  if (handle) params.set('handle', handle);
  if (cursor) params.set('cursor', cursor);
  if (where) params.set('where', where);

  return originUrl;
};

/**
 * Make request to Electric proxy, copying Electric Protocol params
 * @see https://electric-sql.com/docs/guides/auth#proxy-auth
 * @param {string} table
 * @param {ElectricUrlQuery} query
 * @returns {Response}
 */
export const proxyElectricSync = async (table: string, query: ElectricUrlQuery, entityType?: EntityType): Promise<Response> => {
  try {
    const originUrl = prepareElectricUrl(table, query);

    const { body, headers, status, statusText } = await fetch(originUrl);

    // Fetch decompresses the body but doesn't remove the
    // content-encoding & content-length headers which would
    // break decoding in the browser.
    //
    // See https://github.com/whatwg/fetch/issues/1729
    const safeHeaders = new Headers(headers);
    safeHeaders.delete('content-encoding');
    safeHeaders.delete('content-length');
    // safeHeaders.set('vary', 'cookie')

    // Construct a new Response you control
    return new Response(body, { status, statusText, headers: safeHeaders });
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error('Unknown electric error', { cause });

    throw new AppError({
      name: error.name,
      message: error.message,
      status: 500,
      type: 'sync_failed',
      severity: 'error',
      entityType,
      originalError: error,
    });
  }
};
