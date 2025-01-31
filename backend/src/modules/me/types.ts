import type { z } from 'zod';
import type { menuItemSchema, userMenuSchema } from './schema';

export type MenuItem = z.infer<typeof menuItemSchema>;
export type UserMenu = z.infer<typeof userMenuSchema>;
