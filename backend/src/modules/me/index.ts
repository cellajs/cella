import { and, count, desc, eq, inArray } from 'drizzle-orm';

import { db } from '../../db/db';
import { auth } from '../../db/lucia';
import { membershipsTable } from '../../db/schema/memberships';
import { organizationsTable } from '../../db/schema/organizations';
import { projectsTable } from '../../db/schema/projects';
import { usersTable } from '../../db/schema/users';
import { workspacesTable } from '../../db/schema/workspaces';
import { type ErrorType, createError, errorResponse } from '../../lib/errors';
import { logEvent } from '../../middlewares/logger/log-event';
import { CustomHono } from '../../types/common';
import { removeSessionCookie } from '../auth/helpers/cookies';
import { checkSlugAvailable } from '../general/helpers/check-slug';
import { transformDatabaseUser } from '../users/helpers/transform-database-user';
import { getUserMenuConfig, meRouteConfig, terminateSessionsConfig, updateSelfConfig } from './routes';

import { projectsToWorkspacesTable } from '../../db/schema/projects-to-workspaces';
import { generateElectricJWTToken } from '../../lib/utils';

const app = new CustomHono();

// Me (self) endpoints
const meRoutes = app
  /*
   * Get current user
   */
  .openapi(meRouteConfig, async (ctx) => {
    const user = ctx.get('user');

    const [{ memberships }] = await db
      .select({
        memberships: count(),
      })
      .from(membershipsTable)
      .where(eq(membershipsTable.userId, user.id));

    //TODO: move this to a helper function
    const sessions = await auth.getUserSessions(user.id);
    const currentSessionId = auth.readSessionCookie(ctx.req.raw.headers.get('Cookie') ?? '');
    const preparedSessions = sessions.map((session) => ({
      ...session,
      type: 'DESKTOP' as const,
      current: session.id === currentSessionId,
    }));

    // Generate a JWT token for electric
    const electricJWTToken = await generateElectricJWTToken({ userId: user.id });

    return ctx.json(
      {
        success: true,
        data: {
          ...transformDatabaseUser(user),
          sessions: preparedSessions,
          electricJWTToken,
          counts: {
            memberships,
          },
        },
      },
      200,
    );
  })
  /*
   * Get current user menu
   */
  .openapi(getUserMenuConfig, async (ctx) => {
    const user = ctx.get('user');

    const organizationsWithMemberships = await db
      .select({
        organization: organizationsTable,
        membership: membershipsTable,
      })
      .from(organizationsTable)
      .where(and(eq(membershipsTable.userId, user.id), eq(membershipsTable.type, 'ORGANIZATION')))
      .orderBy(desc(organizationsTable.createdAt))
      .innerJoin(membershipsTable, eq(membershipsTable.organizationId, organizationsTable.id));

    const workspacesWithMemberships = await db
      .select({
        workspace: workspacesTable,
        membership: membershipsTable,
      })
      .from(workspacesTable)
      .where(and(eq(membershipsTable.userId, user.id), eq(membershipsTable.type, 'WORKSPACE')))
      .orderBy(desc(workspacesTable.createdAt))
      .innerJoin(membershipsTable, eq(membershipsTable.workspaceId, workspacesTable.id));

    const projectsWithMemberships = await db
      .select({
        project: projectsTable,
        membership: membershipsTable,
      })
      .from(projectsTable)
      .where(and(eq(membershipsTable.userId, user.id), eq(membershipsTable.type, 'PROJECT')))
      .orderBy(desc(projectsTable.createdAt))
      .innerJoin(membershipsTable, eq(membershipsTable.projectId, projectsTable.id));

    // TODO: Integrate querying projects-to-workspace relations into the workspace/project query
    const projectsToWorkspaces = workspacesWithMemberships?.length
      ? await db
          .select()
          .from(projectsToWorkspacesTable)
          .where(
            inArray(
              projectsToWorkspacesTable.workspaceId,
              workspacesWithMemberships.map(({ workspace }) => workspace.id),
            ),
          )
      : [];

    const organizations = organizationsWithMemberships.map(({ organization, membership }) => {
      return {
        slug: organization.slug,
        id: organization.id,
        createdAt: organization.createdAt,
        modifiedAt: organization.modifiedAt,
        name: organization.name,
        thumbnailUrl: organization.thumbnailUrl,
        archived: membership.inactive,
        muted: membership.muted,
        membershipId: membership.id,
        role: membership.role,
      };
    });

    const projects = projectsWithMemberships.map(({ project, membership }) => {
      return {
        slug: project.slug,
        id: project.id,
        createdAt: project.createdAt,
        modifiedAt: project.modifiedAt,
        name: project.name,
        color: project.color,
        organizationId: project.organizationId,
        archived: membership.inactive,
        muted: membership.muted,
        membershipId: membership.id,
        role: membership.role,
      };
    });

    const workspaces = workspacesWithMemberships.map(({ workspace, membership }) => {
      // TODO: Enhance project filtering by integrating the query of workspace-project relations
      const projectsids = projectsToWorkspaces.filter((p) => p.workspaceId === workspace.id).map(({ projectId }) => projectId);

      return {
        slug: workspace.slug,
        id: workspace.id,
        createdAt: workspace.createdAt,
        modifiedAt: workspace.modifiedAt,
        name: workspace.name,
        thumbnailUrl: workspace.thumbnailUrl,
        organizationId: workspace.organizationId,
        archived: membership.inactive,
        muted: membership.muted,
        membershipId: membership.id,
        role: membership.role,
        submenu: {
          items: projects.filter(({ id }) => projectsids.includes(id)),
          type: 'PROJECT' as const,
          canCreate: false,
          submenuTo: workspace.id,
        },
      };
    });

    return ctx.json(
      {
        success: true,
        data: {
          organizations: { items: organizations, type: 'ORGANIZATION' as const, canCreate: true },
          workspaces: { items: workspaces, type: 'WORKSPACE' as const, canCreate: true },
        },
      },
      200,
    );
  })
  /*
   * Terminate a session
   */
  .openapi(terminateSessionsConfig, async (ctx) => {
    const { ids } = ctx.req.valid('query');

    const sessionIds = Array.isArray(ids) ? ids : [ids];

    const cookieHeader = ctx.req.raw.headers.get('Cookie');
    const currentSessionId = auth.readSessionCookie(cookieHeader ?? '');

    const errors: ErrorType[] = [];

    await Promise.all(
      sessionIds.map(async (id) => {
        try {
          if (id === currentSessionId) {
            removeSessionCookie(ctx);
          }
          await auth.invalidateSession(id);
        } catch (error) {
          errors.push(createError(ctx, 404, 'not_found', 'warn', undefined, { session: id }));
        }
      }),
    );

    return ctx.json({ success: true, errors: errors }, 200);
  })
  /*
   * Update current user (self)
   */
  .openapi(updateSelfConfig, async (ctx) => {
    const user = ctx.get('user');
    const [targetUser] = await db.select().from(usersTable).where(eq(usersTable.id, user.id));

    if (!targetUser) {
      return errorResponse(ctx, 404, 'not_found', 'warn', 'USER', { user: user.id });
    }

    const { email, bannerUrl, bio, firstName, lastName, language, newsletter, thumbnailUrl, slug } = ctx.req.valid('json');

    if (slug && slug !== targetUser.slug) {
      const slugAvailable = await checkSlugAvailable(slug);

      if (!slugAvailable) return errorResponse(ctx, 409, 'slug_exists', 'warn', 'USER', { slug });
    }

    const [updatedUser] = await db
      .update(usersTable)
      .set({
        email,
        bannerUrl,
        bio,
        firstName,
        lastName,
        language,
        newsletter,
        thumbnailUrl,
        slug,
        name: [firstName, lastName].filter(Boolean).join(' ') || slug,
        modifiedAt: new Date(),
        modifiedBy: user.id,
      })
      .where(eq(usersTable.id, user.id))
      .returning();

    const [{ memberships }] = await db
      .select({
        memberships: count(),
      })
      .from(membershipsTable)
      .where(eq(membershipsTable.userId, updatedUser.id));

    logEvent('User updated', { user: updatedUser.id });

    // Generate a JWT token for electric
    const electricJWTToken = await generateElectricJWTToken({ userId: user.id });

    //TODO: move this to a helper function
    const sessions = await auth.getUserSessions(user.id);
    const currentSessionId = auth.readSessionCookie(ctx.req.raw.headers.get('Cookie') ?? '');
    const preparedSessions = sessions.map((session) => ({
      ...session,
      type: 'DESKTOP' as const,
      current: session.id === currentSessionId,
    }));

    return ctx.json(
      {
        success: true,
        data: {
          ...transformDatabaseUser(updatedUser),
          electricJWTToken,
          sessions: preparedSessions,
          counts: {
            memberships,
          },
        },
      },
      200,
    );
  });

export default meRoutes;
