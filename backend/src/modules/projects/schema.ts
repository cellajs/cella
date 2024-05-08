// import { z } from 'zod';

// import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
// import { projectsTable } from '../../db/schema/projects';
// import { nameSchema, validSlugSchema, idSchema, colorSchema } from '../../lib/common-schemas';

// import { apiUserSchema } from '../users/schema';
// import { apiMembershipSchema } from '../memberships/schema';

// export const apiWorkspaceUserSchema = z.object({
//   ...apiUserSchema.shape,
//   workspaceRole: apiMembershipSchema.shape.role,
// });

// export const apiProjectsSchema = z.object({
//   ...createSelectSchema(projectsTable).shape,
//   createdAt: z.string(),
//   modifiedAt: z.string().nullable(),
//   role: apiMembershipSchema.shape.role.nullable(),
// });

// export const createProjectJsonSchema = z.object({
//   name: nameSchema,
//   slug: validSlugSchema,
// });

// export const updateProjectJsonSchema = createInsertSchema(projectsTable, {
//   slug: validSlugSchema,
//   name: nameSchema,
//   color: colorSchema,
//   workspaceId: idSchema,
// })
// .pick({
//   slug: true,
//   name: true,
//   color: true,
//   workspaceId: true,
// })
// .partial();
