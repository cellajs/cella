import type { EntityActionType, EntityType } from '../../types.ts';
import { createEntityHierarchy, createRoleRegistry, type EntityHierarchy } from '../config-builder/entity-hierarchy.ts';
import { configurePermissions, type PermissionsConfigResult, type PolicyCallback, type PolicyCellInput } from '../permissions/index.ts';

// Two hierarchies and policy matrices copied from apps built on the template. Only such hierarchies produce the
// intermediate, home-scoped and conditional read scopes, so the scope compiler is proven against them.

type Cells = Partial<Record<EntityActionType, PolicyCellInput>>;
type Channels<C extends string, R extends string> = Record<C, Record<R, (cells: Cells) => void>>;
type MatrixCallback<C extends string, R extends string> = (config: { entityType: string; channels: Channels<C, R>; publicRead: () => void }) => void;

/** A hierarchy with its policy matrix and public read grants. */
export interface MatrixFixture {
  name: string;
  hierarchy: EntityHierarchy;
  permissions: PermissionsConfigResult;
}

const matrixOf = <C extends string, R extends string>(hierarchy: EntityHierarchy, callback: MatrixCallback<C, R>): PermissionsConfigResult =>
  // The matrix builder is typed by the template's entities and roles; the fixture vocabulary is cast to them.
  configurePermissions(hierarchy.allTypes as unknown as readonly EntityType[], callback as unknown as PolicyCallback, { hierarchy });

const projectsRoles = createRoleRegistry(['admin', 'member', 'guest'] as const);

/** Workspaces and projects side by side under the organization; products live in a project; only organization admins are elevated. */
export const projectsMatrixFixture: MatrixFixture = (() => {
  const hierarchy = createEntityHierarchy(projectsRoles)
    .user()
    .organization({ roles: ['admin', 'member'], elevated: ['admin'] })
    .channel('workspace', { parent: 'organization', roles: projectsRoles.all })
    .channel('project', { parent: 'organization', roles: projectsRoles.all })
    .product('task', { parent: 'project' })
    .product('label', { parent: 'project' })
    .product('attachment', { parent: 'project' })
    .build();

  const permissions = matrixOf<'organization' | 'workspace' | 'project', 'admin' | 'member' | 'guest'>(
    hierarchy,
    ({ entityType, channels, publicRead }) => {
      switch (entityType) {
        case 'organization':
          channels.organization.admin({ read: 1, update: 1, delete: 1 });
          channels.organization.member({ read: 1, update: 0, delete: 0 });
          break;
        case 'workspace':
          channels.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
          channels.organization.member({ create: 1, read: 1, update: 0, delete: 0 });
          channels.workspace.admin({ read: 1, update: 1, delete: 1 });
          channels.workspace.member({ read: 1, update: 0, delete: 0 });
          channels.workspace.guest({ read: 0, update: 0, delete: 0 });
          break;
        case 'project':
          publicRead();
          channels.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
          channels.organization.member({ create: 1, read: 1, update: 0, delete: 0 });
          channels.project.admin({ read: 1, update: 1, delete: 1 });
          channels.project.member({ read: 1, update: 0, delete: 0 });
          channels.project.guest({ read: 1, update: 0, delete: 0 });
          break;
        case 'attachment':
          publicRead();
          channels.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
          channels.organization.member({ create: 1, read: 'own', update: 0, delete: 0 });
          channels.project.admin({ create: 1, read: 1, update: 1, delete: 1 });
          channels.project.member({ create: 1, read: 1, update: 0, delete: 1 });
          channels.project.guest({ create: 0, read: 1, update: 0, delete: 0 });
          break;
        case 'label':
          channels.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
          channels.organization.member({ create: 0, read: 0, update: 0, delete: 0 });
          channels.project.admin({ create: 1, read: 1, update: 1, delete: 1 });
          channels.project.member({ create: 1, read: 1, update: 1, delete: 1 });
          channels.project.guest({ create: 0, read: 0, update: 0, delete: 0 });
          break;
        case 'task':
          publicRead();
          channels.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
          channels.organization.member({ create: 0, read: 0, update: 0, delete: 0 });
          channels.project.admin({ create: 1, read: 1, update: 1, delete: 1 });
          channels.project.member({ create: 1, read: 1, update: 1, delete: 1 });
          channels.project.guest({ create: 0, read: 1, update: 0, delete: 0 });
          break;
      }
    },
  );

  return { name: 'projects', hierarchy, permissions };
})();

const coursesRoles = createRoleRegistry(['admin', 'staff', 'student', 'guest', 'owner', 'coach', 'follower'] as const);

/** A course, section and project chain with products at any depth; staff are elevated on courses and sections. */
export const coursesMatrixFixture: MatrixFixture = (() => {
  const hierarchy = createEntityHierarchy(coursesRoles)
    .user()
    .organization({ roles: ['admin', 'staff', 'guest'], elevated: ['admin'] })
    .channel('course', { parent: 'organization', roles: ['staff', 'student', 'guest'], elevated: ['staff'] })
    .channel('courseSection', { parent: 'course', roles: ['staff', 'student', 'guest'], elevated: ['staff'] })
    .channel('project', { parent: 'courseSection', roles: ['owner', 'coach', 'follower'] })
    .product('item', { parent: 'project', nullableAncestors: ['project', 'courseSection', 'course'] })
    .product('label', { parent: 'project', nullableAncestors: ['project', 'courseSection', 'course'] })
    .product('material', { parent: 'courseSection', nullableAncestors: ['courseSection'] })
    .product('comment', { parent: 'project', nullableAncestors: ['project', 'courseSection', 'course'] })
    .product('attachment', { parent: 'project', nullableAncestors: ['project', 'courseSection', 'course'] })
    .build();

  type Role = 'admin' | 'staff' | 'student' | 'guest' | 'owner' | 'coach' | 'follower';
  const permissions = matrixOf<'organization' | 'course' | 'courseSection' | 'project', Role>(hierarchy, ({ entityType, channels, publicRead }) => {
    switch (entityType) {
      case 'organization':
        channels.organization.admin({ read: 1, update: 1, delete: 1 });
        channels.organization.staff({ read: 1, update: 0, delete: 0 });
        channels.organization.guest({ read: 1, update: 0, delete: 0 });
        break;
      case 'course':
        channels.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
        channels.organization.staff({ create: 1, read: 1 });
        channels.organization.guest({});
        channels.course.staff({ read: 1, update: 1, delete: 1 });
        channels.course.student({ read: 1 });
        channels.course.guest({ read: 1 });
        break;
      case 'courseSection':
        channels.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
        channels.organization.staff({ read: 1 });
        channels.organization.guest({});
        channels.course.staff({ create: 1, read: 1, update: 1, delete: 1 });
        channels.course.student({ read: 1 });
        channels.course.guest({});
        channels.courseSection.staff({ read: 1, update: 1, delete: 1 });
        channels.courseSection.student({ read: 1 });
        channels.courseSection.guest({ read: 1 });
        break;
      case 'project':
        publicRead();
        channels.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
        channels.organization.staff({ create: 1, read: 1 });
        channels.organization.guest({});
        channels.course.staff({ create: 1, read: 1, update: 1, delete: 1 });
        channels.course.student({ create: 1, read: 1 });
        channels.course.guest({});
        channels.courseSection.staff({ create: 1, read: 1, update: 1, delete: 1 });
        channels.courseSection.student({ create: 1, read: 1 });
        channels.courseSection.guest({});
        channels.project.owner({ read: 1, update: 1, delete: 1 });
        channels.project.coach({ read: 1 });
        channels.project.follower({ read: 1 });
        break;
      case 'item':
        publicRead();
        channels.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
        channels.organization.staff({});
        channels.organization.guest({});
        channels.course.staff({ create: 1, read: 1, update: 1, delete: 1 });
        channels.course.student({ create: 1, read: 1, update: 'own', delete: 'own' });
        channels.course.guest({ read: 1 });
        channels.courseSection.staff({ create: 1, read: 1, update: 1, delete: 1 });
        channels.courseSection.student({ create: 1, read: 1, update: 'own', delete: 'own' });
        channels.courseSection.guest({ read: 1 });
        channels.project.owner({ create: 1, read: 1, update: 1, delete: 1 });
        channels.project.coach({ create: 1, read: 1, update: 'own', delete: 'own' });
        channels.project.follower({ create: 1, read: 1, update: 'own', delete: 'own' });
        break;
      case 'label':
        channels.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
        channels.organization.staff({});
        channels.organization.guest({});
        channels.course.staff({ create: 1, read: 1, update: 1, delete: 1 });
        channels.course.student({ read: 1 });
        channels.course.guest({ read: 1 });
        channels.courseSection.staff({ create: 1, read: 1, update: 1, delete: 1 });
        channels.courseSection.student({ read: 1 });
        channels.courseSection.guest({ read: 1 });
        channels.project.owner({ create: 1, read: 1, update: 1, delete: 1 });
        channels.project.coach({ create: 1, read: 1 });
        channels.project.follower({ create: 1, read: 1 });
        break;
      case 'material':
        channels.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
        channels.organization.staff({});
        channels.organization.guest({});
        channels.course.staff({ create: 1, read: 1, update: 1, delete: 1 });
        channels.course.student({ read: 1 });
        channels.course.guest({ read: 1 });
        channels.courseSection.staff({ create: 1, read: 1, update: 1, delete: 1 });
        channels.courseSection.student({ read: 1 });
        channels.courseSection.guest({ read: 1 });
        break;
      case 'comment':
        publicRead();
        channels.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
        channels.organization.staff({});
        channels.organization.guest({});
        channels.course.staff({ create: 1, read: 1, update: 'own', delete: 1 });
        channels.course.student({ create: 1, read: 1, update: 'own', delete: 'own' });
        channels.course.guest({ create: 1, read: 1, update: 'own', delete: 'own' });
        channels.courseSection.staff({ create: 1, read: 1, update: 'own', delete: 1 });
        channels.courseSection.student({ create: 1, read: 1, update: 'own', delete: 'own' });
        channels.courseSection.guest({ create: 1, read: 1, update: 'own', delete: 'own' });
        channels.project.owner({ create: 1, read: 1, update: 'own', delete: 1 });
        channels.project.coach({ create: 1, read: 1, update: 'own', delete: 'own' });
        channels.project.follower({ create: 1, read: 1, update: 'own', delete: 'own' });
        break;
      case 'attachment':
        channels.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
        channels.organization.staff({ create: 1, read: 1, update: 'own', delete: 'own' });
        channels.organization.guest({ create: 1, read: 1, update: 'own', delete: 'own' });
        channels.course.staff({ create: 1, read: 1, update: 1, delete: 1 });
        channels.course.student({ create: 1, read: 1, update: 'own', delete: 'own' });
        channels.course.guest({ read: 1 });
        channels.courseSection.staff({ create: 1, read: 1, update: 1, delete: 1 });
        channels.courseSection.student({ create: 1, read: 1, update: 'own', delete: 'own' });
        channels.courseSection.guest({ read: 1 });
        channels.project.owner({ create: 1, read: 1, update: 1, delete: 1 });
        channels.project.coach({ create: 1, read: 1, update: 'own', delete: 'own' });
        channels.project.follower({ create: 1, read: 1, update: 'own', delete: 'own' });
        break;
    }
  });

  return { name: 'courses', hierarchy, permissions };
})();
