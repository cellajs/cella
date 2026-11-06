import { createHash } from 'node:crypto';
import { z } from '@hono/zod-openapi';
import { isRecord } from 'shared/utils/as-record';
import { AppError } from '#/core/error';
import { decryptData, encryptData } from '#/utils/data-encryption';
import { seqRangeOf } from '#/utils/seq-range';

/** Where a page starts in its list, and how many rows to read from there. */
export interface PageWindow {
  offset: number;
  limit: number;
}

/** The paging params as `pageQuerySchema` parses them, and the range bounds of a product list. */
interface PageQuery {
  pageToken?: string;
  maxPageSize: number;
  skip: number;
  afterSeq?: number;
  untilSeq?: number;
}

/** The rows of a window as an operation reads them, and the total the list holds. */
interface WindowRows<T> {
  items: T[];
  total: number;
}

/** Rows before a token's position that its page reads again, to find the previous page's last rows when rows before them left the list. */
const anchorReach = 10;

/** The last rows of a page whose ids its token keeps. */
const anchorCount = 2;

/** What a page token seals: the offset of the next page, and the ids of the last rows of the page that issued it. */
const tokenPayloadSchema = z.object({ offset: z.int().min(0), anchors: z.array(z.string()).max(anchorCount) });

type PagePosition = z.infer<typeof tokenPayloadSchema>;

const idOf = (row: unknown) => (isRecord(row) && typeof row.id === 'string' ? row.id : undefined);

/** `value` with object keys sorted and undefined members left out, so equal params serialize alike. */
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, member]) => member !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, member]) => [key, canonical(member)]),
  );
};

/**
 * The encryption purpose of a list's tokens: a digest of the request path and the other params, so a token decrypts only
 * for the list and the params that issued it. `maxPageSize` and `skip` stay out: they may change between pages.
 */
const tokenPurpose = (path: string, params: object) =>
  `page-token:${createHash('sha256')
    .update(path)
    .update('\n')
    .update(JSON.stringify(canonical(params)))
    .digest('base64url')}`;

/**
 * A page token seals the position of the next page with AES-256-GCM, so a client can neither read nor forge it
 * (AEP-158). The format is the server's to change: a client sends a token back as it came and reads nothing from it.
 */
const sealPageToken = (position: PagePosition, purpose: string) => encryptData(JSON.stringify(position), purpose);

/** @throws AppError 400 `invalid_page_token` for a token that was altered, or issued for another list or other params. */
const openPageToken = (token: string, purpose: string): PagePosition => {
  try {
    return tokenPayloadSchema.parse(JSON.parse(decryptData(token, purpose)));
  } catch {
    throw new AppError(400, 'invalid_page_token', 'warn');
  }
};

/**
 * One page of a list (AEP-158): opens `pageToken`, moves `skip` further, and reads one row more than `maxPageSize` to
 * learn whether more follow, sealing the next position in `nextPageToken` when they do. A page read by token without a
 * skip starts after the previous page's last row while that row is within `anchorReach` of the token's offset, so rows
 * that left the list before it skip none; rows that entered before it repeat on the page, which the client shows once.
 * A range read (`afterSeq` and `untilSeq`) is a sync chunk: it reads from its lower bound and returns no token. Members
 * of the read besides `items` and `total` stay on the page.
 * @param ctx the request, whose path a token is bound to
 * @param read reads a window of the list
 * @throws AppError 400 `invalid_page_token`
 */
export async function readListPage<T, E extends object = object>(
  ctx: { req: { path: string } },
  query: PageQuery,
  read: (window: PageWindow) => Promise<WindowRows<T> & E>,
) {
  const { pageToken, maxPageSize, skip, ...params } = query;

  if (seqRangeOf(query)) {
    const { items, total, ...rest } = await read({ offset: 0, limit: maxPageSize });
    return { ...rest, results: items, totalSize: total };
  }

  const purpose = tokenPurpose(ctx.req.path, params);
  const position = pageToken ? openPageToken(pageToken, purpose) : { offset: 0, anchors: [] };
  const reach = skip || !position.anchors.length ? 0 : Math.min(anchorReach, position.offset);
  const start = position.offset + skip - reach;
  const { items, total, ...rest } = await read({ offset: start, limit: reach + maxPageSize + 1 });

  const anchorIndex = items.slice(0, reach).findLastIndex((row) => {
    const id = idOf(row);
    return id !== undefined && position.anchors.includes(id);
  });
  const from = anchorIndex >= 0 ? anchorIndex + 1 : reach;
  const page = items.slice(from, from + maxPageSize + 1);
  const results = page.slice(0, maxPageSize);
  const anchors = results.slice(-anchorCount).flatMap((row) => idOf(row) ?? []);
  const next = { offset: start + from + results.length, anchors };
  return { ...rest, results, nextPageToken: page.length > maxPageSize ? sealPageToken(next, purpose) : undefined, totalSize: total };
}

/** The window of rows a list holds in memory, for a list too small to read from the database page by page. */
export const windowOf = <T>(rows: T[], { offset, limit }: PageWindow): WindowRows<T> => ({
  items: rows.slice(offset, offset + limit),
  total: rows.length,
});
