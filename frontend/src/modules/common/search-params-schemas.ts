import { zApiError } from 'sdk/zod.gen';
import { z } from 'zod';

/** Search params for the error routes: error page, auth error, account OAuth errors. */
export const errorSearchSchema = z.object({ error: z.string().optional(), severity: zApiError.shape.severity.optional() });

/** `userSheetId` opens the user sheet; a page that lists people declares it, since the sheet reads the route's search. */
export const userSheetSearchSchema = z.object({ userSheetId: z.string().optional() });

/** A generated list query: its search, and the `orderBy` values its request schema takes and defaults. */
interface ListQuery<E extends z.ZodEnum> {
  shape: { q: z.ZodOptional<z.ZodString>; orderBy: z.ZodDefault<z.ZodOptional<E>> };
}

/** The search a list opens on: no search, and the `orderBy` the API takes when a request names none. */
export const listSearchDefaults = <E extends z.ZodEnum>({ shape }: ListQuery<E>) => ({ q: '', orderBy: shape.orderBy.parse(undefined) });

/**
 * A list route's search, with the API's own `orderBy` (`name desc`): an absent or unknown value (an old bookmark) reads
 * as `defaults`, the API's unless a view opens on its own.
 */
export const listSearchSchema = <E extends z.ZodEnum>(query: ListQuery<E>, defaults = listSearchDefaults(query)) =>
  z.object({ q: query.shape.q, orderBy: query.shape.orderBy.unwrap().default(defaults.orderBy).catch(defaults.orderBy) });

/** A boolean search param: `true` or `false` in the URL, absent when unset; a navigate may pass the boolean. */
export const booleanSearchParam = z
  .union([z.enum(['true', 'false']), z.boolean()])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === true || value === 'true'));

/**
 * A list in one key, comma-separated, as the API reads it through `csvQuerySchema`: `?status=started,finished`.
 * A value `item` refuses is dropped, so a stale bookmark still opens; a navigate may pass the array.
 * @public
 */
export const csvSearchParam = <T extends string>(item: z.ZodType<T>) =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => {
      const values = value === undefined ? [] : Array.isArray(value) ? value : value.split(',');
      return values.filter((entry): entry is T => item.safeParse(entry).success);
    });
