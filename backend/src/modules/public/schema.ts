import { z } from 'zod';

export const apiPublicCountsSchema = z.object({
  organizations: z.number(),
  users: z.number(),
});
