import { z } from '@hono/zod-openapi';
import { mapEntitiesToSchema } from '#/schemas';

export const publicCountsSchema = mapEntitiesToSchema(() => z.number());
