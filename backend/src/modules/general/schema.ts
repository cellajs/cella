import { z } from 'zod';

import { idSchema, slugSchema } from '../../lib/common-schemas';
import { membershipSchema } from '../organizations/schema';
import { apiUserSchema } from '../users/schema';

export const inviteJsonSchema = z.object({
  resourceIdentifier: slugSchema.or(idSchema).optional(),
  emails: apiUserSchema.shape.email.array().min(1),
  role: z.union([apiUserSchema.shape.role, membershipSchema.shape.role]).optional(),
});

export const apiPublicCountsSchema = z.object({
  organizations: z.number(),
  users: z.number(),
});
