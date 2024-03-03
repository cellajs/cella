import { z } from 'zod';

import { idSchema, slugSchema } from '../../lib/common-schemas';
import { apiUserSchema } from '../users/schema';

export const inviteJsonSchema = z.object({
  organizationIdentifier: slugSchema.or(idSchema).optional(),
  emails: apiUserSchema.shape.email.array().min(1),
});

export const apiPublicCountsSchema = z.object({
  organizations: z.number(),
  users: z.number(),
});
