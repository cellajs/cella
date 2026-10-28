import { z } from '@hono/zod-openapi';
import { appConfig } from 'shared';

/**
 * The types the public counts cover: users and channel types. Product tables enforce row-level security, which hides
 * every row from a count outside a tenant.
 */
export const publicCountTypes = ['user', ...appConfig.channelEntityTypes] as const;

type PublicCountType = (typeof publicCountTypes)[number];

export const publicCountsSchema = z.object(
  Object.fromEntries(publicCountTypes.map((type) => [type, z.number()])) as Record<PublicCountType, z.ZodNumber>,
);
