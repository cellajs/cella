import { z } from '@hono/zod-openapi';
import type { FederationKey } from 'shared';
import { federationKeys } from '#/modules/auth/core/federations/federation-keys';
import { isFederationKey } from '#/modules/auth/core/federations/federations';
import { maxLength } from '#/schemas';

/**
 * A federation key of this app's config, bounded before the lookup. With `type` set the docs show the metadata alone: a
 * string and, when the app declares federations, their enum.
 */
export const federationKeySchema = z
  .string()
  .max(maxLength.field)
  .pipe(z.custom<FederationKey>((value) => typeof value === 'string' && isFederationKey(value), { message: 'Unknown federation' }))
  .openapi({ type: 'string', description: 'A federation key in appConfig.federations', ...(federationKeys.length ? { enum: federationKeys } : {}) });

/** A federation as a response names it: its config key and name. */
export const federationRefSchema = z.object({ key: federationKeySchema, name: z.string() });
