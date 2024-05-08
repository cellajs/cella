// import { and, eq, inArray } from 'drizzle-orm';
// import { db } from '../../db/db';
// import { membershipsTable } from '../../db/schema/memberships';
// import { projectsTable } from '../../db/schema/projects';

// import { createError, errorResponse, type ErrorType } from '../../lib/errors';
// import { sendSSE } from '../../lib/sse';
// import { logEvent } from '../../middlewares/logger/log-event';
// import { CustomHono } from '../../types/common';
// import { checkSlugAvailable } from '../general/helpers/check-slug';
// import { createProjectRouteConfig, getProjectByIdOrSlugRouteConfig, updateProjectRouteConfig, deleteProjectsRouteConfig } from './routes';

// const app = new CustomHono();

// // * Project endpoints
// const projectssRoutes = app
//   /*
//    * Create project
//    */
//   .openapi(createProjectRouteConfig, async (ctx) => {
//     const { name, slug } = ctx.req.valid('json');
//     const user = ctx.get('user');
//     const workspace = ctx.get('workspace');

//     const slugAvailable = await checkSlugAvailable(slug, 'PROJECT');

//     if (!slugAvailable) {
//       return errorResponse(ctx, 409, 'slug_exists', 'warn', 'PROJECT', { slug });
//     }

//     const [createdProject] = await db
//       .insert(projectsTable)
//       .values({
//         workspaceId: workspace.id,
//         name,
//         slug,
//       })
//       .returning();

//     logEvent('Project created', { project: createdProject.id });

//     await db.insert(membershipsTable).values({
//       userId: user.id,
//       projectId: createdProject.id,
//       type: 'PROJECT',
//       // ? role: workspace.role,
//     });

//     logEvent('User added to project', {
//       user: user.id,
//       project: createdProject.id,
//     });

//     sendSSE(user.id, 'new_project_membership', {
//       ...createdProject,
//       // ? role: workspace.role,
//       type: 'PROJECT',
//     });

//     return ctx.json({
//       success: true,
//       data: {
//         ...createdProject,
//         // ? role: workspace.role as const,
//       },
//     });
//   })

//   /*
//    * Get project by id or slug
//    */
//   .openapi(getProjectByIdOrSlugRouteConfig, async (ctx) => {
//     const user = ctx.get('user');
//     const project = ctx.get('project');

//     const [membership] = await db
//       .select()
//       .from(membershipsTable)
//       .where(and(eq(membershipsTable.userId, user.id), eq(membershipsTable.workspaceId, project.id)));

//     return ctx.json({
//       success: true,
//       data: {
//         ...project,
//         role: membership?.role || null,
//       },
//     });
//   })

//   /*
//    * Update project
//    */
//   .openapi(updateProjectRouteConfig, async (ctx) => {
//     const user = ctx.get('user');
//     const project = ctx.get('project');

//     const { name, slug, color, workspaceId } = ctx.req.valid('json');

//     if (slug && slug !== project.slug) {
//       const slugAvailable = await checkSlugAvailable(slug, 'PROJECT');

//       if (!slugAvailable) {
//         return errorResponse(ctx, 409, 'slug_exists', 'warn', 'PROJECT', { slug });
//       }
//     }

//     const [updatedProject] = await db
//       .update(projectTable)
//       .set({
//         name,
//         slug,
//         color,
//         workspaceId,
//         modifiedAt: new Date(),
//         modifiedBy: user.id,
//       })
//       .where(eq(projectTable.id, project.id))
//       .returning();

//     const [membership] = await db
//       .select()
//       .from(membershipsTable)
//       .where(and(eq(membershipsTable.userId, user.id), eq(membershipsTable.projectId, project.id)));

//     if (membership) {
//       sendSSE(user.id, 'update_project', {
//         ...updatedProject,
//         role: membership.role,
//         type: 'PROJECT',
//       });
//     }

//     logEvent('Project updated', { project: updatedProject.id });

//     return ctx.json({
//       success: true,
//       data: {
//         ...updatedProject,
//         role: membership?.role || null,
//       },
//     });
//   })

//   /*
//    * Delete projects
//    */
//   .openapi(deleteProjectsRouteConfig, async (ctx) => {
//     const { ids } = ctx.req.valid('query');
//     const user = ctx.get('user');

//     // * Convert the projects ids to an array
//     const projectsIds = Array.isArray(ids) ? ids : [ids];

//     const errors: ErrorType[] = [];

//     // * Get the projects and the user role
//     const targets = await db
//       .select({
//         project: projectsTable,
//         userRole: membershipsTable.role,
//       })
//       .from(projectsTable)
//       .leftJoin(membershipsTable, and(eq(membershipsTable.projectId, projectsTable.id), eq(membershipsTable.userId, user.id)))
//       .where(inArray(projectsTable.id, projectsIds));

//     // * Check if the projects exist
//     for (const id of projectsIds) {
//       if (!targets.some((target) => target.project.id === id)) {
//         errors.push(
//           createError(ctx, 404, 'not_found', 'warn', 'PROJECT', {
//             project: id,
//           }),
//         );
//       }
//     }

//     // * Filter out projects that the user doesn't have permission to delete
//     const allowedTargets = targets.filter((target) => {
//       const projectId = target.project.id;

//       if (user.role !== 'ADMIN' && target.userRole !== 'ADMIN') {
//         errors.push(
//           createError(ctx, 403, 'delete_forbidden', 'warn', 'PROJECT', {
//             project: projectId,
//           }),
//         );
//         return false;
//       }

//       return true;
//     });

//     // * If the user doesn't have permission to delete any of the projects, return an error
//     if (allowedTargets.length === 0) {
//       return ctx.json({
//         success: false,
//         errors: errors,
//       });
//     }

//     // * Delete the projectId
//     await db.delete(projectsTable).where(
//       inArray(
//         projectsTable.id,
//         allowedTargets.map((target) => target.project.id),
//       ),
//     );

//     // * Send SSE events for the projects that were deleted
//     for (const { project, userRole } of allowedTargets) {
//       // * Send the event to the user if they are a member of the project
//       if (userRole) {
//         sendSSE(user.id, 'remove_project', project);
//       }

//       logEvent('Project deleted', { project: project.id });
//     }

//     return ctx.json({
//       success: true,
//       errors: errors,
//     });
//   });

// export default projectsRoutes;

// export type ProjectsRoutes = typeof projectsRoutes;
