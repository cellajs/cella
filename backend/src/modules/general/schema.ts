import { z } from 'zod';

import { idSchema, passwordSchema, slugSchema } from '../../lib/common-schemas';
import { membershipSchema } from '../organizations/schema';
import { apiUserSchema } from '../users/schema';
import { createSelectSchema } from 'drizzle-zod';
import { tokensTable } from '../../db/schema/tokens';

export const tokensSchema = createSelectSchema(tokensTable);

export const inviteJsonSchema = z.object({
  organizationIdentifier: slugSchema.or(idSchema).optional(),
  emails: apiUserSchema.shape.email.array().min(1),
  role: z.union([apiUserSchema.shape.role, membershipSchema.shape.role]).optional(),
});

export const acceptInviteJsonSchema = z.object({
  password: passwordSchema.optional(),
  oauth: z.enum(['google', 'microsoft', 'github']).optional(),
});

export const apiPublicCountsSchema = z.object({
  organizations: z.number(),
  users: z.number(),
});
