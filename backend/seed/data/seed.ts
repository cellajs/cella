import { faker } from '@faker-js/faker';

import { db } from '../../src/db/db';
import { nanoid } from '../../src/lib/nanoid';

import { UniqueEnforcer } from 'enforce-unique';
import { labelsTable, type InsertLabelModel } from '../../src/db/schema-electric/labels';
import { tasksTable, type InsertTaskModel } from '../../src/db/schema-electric/tasks';
import { membershipsTable, type InsertMembershipModel } from '../../src/db/schema/memberships';
import { organizationsTable } from '../../src/db/schema/organizations';
import { projectsTable, type InsertProjectModel } from '../../src/db/schema/projects';
import { projectsToWorkspacesTable } from '../../src/db/schema/projects-to-workspaces';
import { workspacesTable, type InsertWorkspaceModel } from '../../src/db/schema/workspaces';
import type { Status } from '../progress';
import { adminUser } from '../user/seed';

export const dataSeed = async (progressCallback?: (stage: string, count: number, status: Status) => void) => {
  const organizations = await db.select().from(organizationsTable);
  const memberships = await db.select().from(membershipsTable);

  const organizationsUniqueEnforcer = new UniqueEnforcer();

  let workspacesCount = 0;
  let projectsCount = 0;
  let tasksCount = 0;
  let labelsCount = 0;
  let membershipsCount = 0;

  for (const organization of organizations) {
    const orgMemberships = memberships.filter((m) => m.organizationId === organization.id);
    const users = orgMemberships.map((el) => {
      return { id: el.userId as string };
    });

    const insertWorkspaces: InsertWorkspaceModel[] = Array.from({ length: 5 }).map(() => {
      const name = organizationsUniqueEnforcer.enforce(() => faker.company.name());

      return {
        id: nanoid(),
        organizationId: organization.id,
        name: faker.company.name(),
        slug: faker.helpers.slugify(name).toLowerCase(),
        bannerUrl: faker.image.url(),
        thumbnailUrl: faker.image.url(),
        createdAt: faker.date.past(),
        createdBy: orgMemberships[Math.floor(Math.random() * orgMemberships.length)].userId,
        modifiedAt: faker.date.past(),
        modifiedBy: orgMemberships[Math.floor(Math.random() * orgMemberships.length)].userId,
      };
    });

    const workspaces = await db.insert(workspacesTable).values(insertWorkspaces).returning().onConflictDoNothing();

    const groupSize = 10;
    let groupIndex = 0;
    for (const workspace of workspaces) {
      workspacesCount++;
      if (progressCallback) progressCallback('workspaces', workspacesCount, 'inserting');

      // slice users to 10 members for each workspace
      const membersGroup = users.slice(groupIndex * groupSize, (groupIndex + 1) * groupSize);
      groupIndex++;

      const workspaceMemberships: InsertMembershipModel[] = membersGroup.map((user) => {
        return {
          id: nanoid(),
          type: 'WORKSPACE',
          userId: user.id,
          organizationId: organization.id,
          workspaceId: workspace.id,
          role: faker.helpers.arrayElement(['ADMIN', 'MEMBER']),
          createdAt: faker.date.past(),
          order: workspacesCount + 1,
        };
      });

      membershipsCount += workspaceMemberships.length;

      if (progressCallback) progressCallback('memberships', membershipsCount, 'inserting');
      // add admin user to every even workspace
      if (workspacesCount % 2 === 0) {
        workspaceMemberships.push({
          id: nanoid(),
          type: 'WORKSPACE',
          userId: adminUser.id,
          organizationId: organization.id,
          workspaceId: workspace.id,
          role: faker.helpers.arrayElement(['ADMIN', 'MEMBER']),
          createdAt: faker.date.past(),
          order: workspacesCount + 1,
        });
      }
      await db.insert(membershipsTable).values(workspaceMemberships).onConflictDoNothing();

      const insertProjects: InsertProjectModel[] = Array.from({ length: 3 }).map(() => {
        const name = organizationsUniqueEnforcer.enforce(() => faker.company.name());

        return {
          id: nanoid(),
          organizationId: organization.id,
          name,
          color: faker.internet.color(),
          slug: faker.helpers.slugify(name).toLowerCase(),
          createdAt: faker.date.past(),
          createdBy: membersGroup[Math.floor(Math.random() * membersGroup.length)].id,
          modifiedAt: faker.date.past(),
          modifiedBy: membersGroup[Math.floor(Math.random() * membersGroup.length)].id,
        };
      });

      const projects = await db.insert(projectsTable).values(insertProjects).returning().onConflictDoNothing();

      for (const project of projects) {
        projectsCount++;
        if (progressCallback) progressCallback('projects', projectsCount, 'inserting');
        //assign project to workspace
        await db.insert(projectsToWorkspacesTable).values({
          projectId: project.id,
          workspaceId: workspace.id,
        });

        const projectMemberships: InsertMembershipModel[] = membersGroup.map((user) => {
          return {
            id: nanoid(),
            userId: user.id,
            type: 'PROJECT',
            organizationId: organization.id,
            projectId: project.id,
            role: faker.helpers.arrayElement(['ADMIN', 'MEMBER']),
            createdAt: faker.date.past(),
            order: projectsCount + 1,
          };
        });

        // add admin user to every even project in every even workspace
        if (workspacesCount % 2 === 0 && projectsCount % 2 === 0) {
          projectMemberships.push({
            id: nanoid(),
            userId: adminUser.id,
            type: 'PROJECT',
            organizationId: organization.id,
            projectId: project.id,
            role: faker.helpers.arrayElement(['ADMIN', 'MEMBER']),
            createdAt: faker.date.past(),
            order: projectsCount + 1,
          });
        }

        membershipsCount += projectMemberships.length;
        if (progressCallback) progressCallback('memberships', membershipsCount, 'inserting');

        await db.insert(membershipsTable).values(projectMemberships).onConflictDoNothing();

        const insertTasks: InsertTaskModel[] = Array.from({ length: 50 }).map((_, index) => {
          const name = organizationsUniqueEnforcer.enforce(() => faker.company.name());

          return {
            id: nanoid(),
            organizationId: organization.id,
            projectId: project.id,
            summary: name,
            slug: faker.helpers.slugify(name).toLowerCase(),
            // TODO: fix this
            order: index,
            // random integer between 0 and 6
            status: Math.floor(Math.random() * 7),
            type: faker.helpers.arrayElement(['bug', 'feature', 'chore']),
            // random integer between 0 and 3
            impact: Math.floor(Math.random() * 4),
            markdown: faker.lorem.paragraphs(),
            createdAt: faker.date.past(),
            createdBy: membersGroup[Math.floor(Math.random() * membersGroup.length)].id,
            modifiedAt: faker.date.past(),
            modifiedBy: membersGroup[Math.floor(Math.random() * membersGroup.length)].id,
            assignedAt: faker.date.past(),
            assignedBy: membersGroup[Math.floor(Math.random() * membersGroup.length)].id,
          };
        });

        tasksCount += insertTasks.length;
        if (progressCallback) progressCallback('tasks', tasksCount, 'inserting');

        await db.insert(tasksTable).values(insertTasks).onConflictDoNothing();

        const insertLabels: InsertLabelModel[] = Array.from({ length: 5 }).map(() => {
          const name = organizationsUniqueEnforcer.enforce(() => faker.company.name());

          return {
            id: nanoid(),
            organizationId: organization.id,
            projectId: project.id,
            name,
            color: faker.internet.color(),
          };
        });

        labelsCount += insertLabels.length;
        if (progressCallback) progressCallback('labels', labelsCount, 'inserting');

        await db.insert(labelsTable).values(insertLabels).onConflictDoNothing();
      }
    }
  }

  if (progressCallback) {
    progressCallback('memberships', membershipsCount, 'done');
    progressCallback('labels', labelsCount, 'done');
    progressCallback('tasks', tasksCount, 'done');
    progressCallback('projects', projectsCount, 'done');
    progressCallback('workspaces', workspacesCount, 'done');
  }
};
