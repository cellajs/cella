import { z } from '@hono/zod-openapi';
import { appConfig, recordFromKeys } from 'shared';

/**
 * The types the public counts cover: users and channel types. Product tables enforce row-level security, which hides
 * every row from a count outside a tenant.
 */
export const publicCountTypes = ['user', ...appConfig.channelEntityTypes] as const;

export const publicCountsSchema = z.object(recordFromKeys(publicCountTypes, () => z.number()));
