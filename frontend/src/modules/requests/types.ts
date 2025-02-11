import type { z } from 'zod';
import type { requestSchema } from '#/modules/requests/schema';

export type Request = z.infer<typeof requestSchema>;
