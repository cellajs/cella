import type { z } from 'zod';
import type { checkTokenSchema } from '#/modules/auth/schema';

export type TokenData = z.infer<typeof checkTokenSchema>;
