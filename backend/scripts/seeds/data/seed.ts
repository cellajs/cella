import { faker } from '@faker-js/faker';

import { db } from '#/db/db';
import { nanoid } from '#/utils/nanoid';

import { type InsertLabelModel, labelsTable } from '#/db/schema/labels';
import { type InsertMembershipModel, membershipsTable } from '#/db/schema/memberships';
import { organizationsTable } from '#/db/schema/organizations';
import { type InsertProjectModel, projectsTable } from '#/db/schema/projects';
import { type InsertTaskModel, tasksTable } from '#/db/schema/tasks';
import { type InsertWorkspaceModel, workspacesTable } from '#/db/schema/workspaces';

import { and, eq } from 'drizzle-orm';
import { UniqueEnforcer } from 'enforce-unique';
import slugify from 'slugify';
import type { Status } from '../progress';
import { adminUser } from '../user/seed';
import { extractKeywords } from './helpers';

export const dataSeed = async (progressCallback?: (stage: string, count: number, status: Status) => void) => {
  const organizations = await db.select().from(organizationsTable);
  const memberships = await db.select().from(membershipsTable);
  const adminMemberships = await db
    .select()
    .from(membershipsTable)
    .where(and(eq(membershipsTable.userId, 'admin12345678'), eq(membershipsTable.type, 'organization')));
  const adminOrgIds = adminMemberships.map((m) => m.organizationId).filter((el) => el !== null);
  const organizationsUniqueEnforcer = new UniqueEnforcer();

  let workspacesCount = 0;
  let projectsCount = 0;
  let tasksCount = 0;
  let labelsCount = 0;
  let membershipsCount = 0;
  let adminWorkspacesMembershipsOrder = 1;
  let adminProjectsMembershipsOrder = 1;

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
        bannerUrl: null,
        thumbnailUrl: null,
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
          type: 'workspace',
          userId: user.id,
          organizationId: organization.id,
          workspaceId: workspace.id,
          role: faker.helpers.arrayElement(['admin', 'member']),
          createdAt: faker.date.past(),
          order: workspacesCount + 1,
        };
      });

      membershipsCount += workspaceMemberships.length;

      if (progressCallback) progressCallback('memberships', membershipsCount, 'inserting');
      // add admin user to every even workspace
      if (workspacesCount % 2 === 0 && adminOrgIds.includes(organization.id)) {
        workspaceMemberships.push({
          id: nanoid(),
          type: 'workspace',
          userId: adminUser.id,
          organizationId: organization.id,
          workspaceId: workspace.id,
          role: faker.helpers.arrayElement(['admin', 'member']),
          createdAt: faker.date.past(),
          order: adminWorkspacesMembershipsOrder,
        });
        adminWorkspacesMembershipsOrder++;
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
          parentId: workspace.id,
        };
      });

      const projects = await db.insert(projectsTable).values(insertProjects).returning().onConflictDoNothing();

      for (const project of projects) {
        projectsCount++;
        if (progressCallback) progressCallback('projects', projectsCount, 'inserting');

        const projectMemberships: InsertMembershipModel[] = membersGroup.map((user) => {
          return {
            id: nanoid(),
            userId: user.id,
            type: 'project',
            organizationId: organization.id,
            projectId: project.id,
            role: faker.helpers.arrayElement(['admin', 'member']),
            createdAt: faker.date.past(),
            order: projectsCount + 1,
          };
        });

        // add admin user to every even project in every even workspace
        if (workspacesCount % 2 === 0 && adminOrgIds.includes(organization.id) && projectsCount % 2 === 0) {
          projectMemberships.push({
            id: nanoid(),
            userId: adminUser.id,
            type: 'project',
            organizationId: organization.id,
            projectId: project.id,
            role: faker.helpers.arrayElement(['admin', 'member']),
            createdAt: faker.date.past(),
            order: adminProjectsMembershipsOrder > 2 ? 1 : adminProjectsMembershipsOrder,
          });
          adminProjectsMembershipsOrder = adminProjectsMembershipsOrder > 2 ? 1 : adminProjectsMembershipsOrder + 1;
        }

        membershipsCount += projectMemberships.length;
        if (progressCallback) progressCallback('memberships', membershipsCount, 'inserting');

        await db.insert(membershipsTable).values(projectMemberships).onConflictDoNothing();

        const insertLabels: InsertLabelModel[] = Array.from({ length: 5 }).map(() => {
          const name = organizationsUniqueEnforcer.enforce(() => slugify(faker.company.name(), { lower: true }));

          return {
            id: nanoid(),
            organizationId: organization.id,
            projectId: project.id,
            lastUsed: faker.date.past(),
            useCount: Math.floor(Math.random() * 20) + 1,
            name,
            color: faker.internet.color(),
          };
        });

        labelsCount += insertLabels.length;
        if (progressCallback) progressCallback('labels', labelsCount, 'inserting');

        const labels = await db.insert(labelsTable).values(insertLabels).onConflictDoNothing().returning();

        const insertTasks: InsertTaskModel[] = Array.from({ length: 50 }).flatMap((_, index) => {
          const taskDescription = faker.commerce.productDescription();
          const name = organizationsUniqueEnforcer.enforce(() => faker.company.name());
          const mainTaskId = nanoid();
          // 60% change to set Subtasks
          const insertSubTasks: InsertTaskModel[] = Array.from({ length: Math.random() < 0.6 ? 0 : Math.floor(Math.random() * 3) + 1 }).map(
            (_, subIndex) => {
              const subTaskDescription = faker.commerce.productDescription();
              const subTaskName = organizationsUniqueEnforcer.enforce(() => faker.company.name());
              return {
                id: nanoid(),
                organizationId: organization.id,
                projectId: project.id,
                summary: `<div class="bn-block-content"><p class="bn-inline-content">${subTaskName}</p></div>`,
                keywords: extractKeywords(subTaskDescription),
                expandable: true,
                parentId: mainTaskId,
                slug: faker.helpers.slugify(subTaskName).toLowerCase(),
                order: subIndex + 1,
                // status in sub tasks only 1 or 6
                status: Math.random() < 0.5 ? 1 : 6,
                impact: 0,
                type: 'chore',
                description: `<div class="bn-block-content"><p class="bn-inline-content">${subTaskName}</p></div><div class="bn-block-content"><p class="bn-inline-content">${subTaskDescription}</p></div>`,
                createdAt: faker.date.past(),
                createdBy: membersGroup[Math.floor(Math.random() * membersGroup.length)].id,
                modifiedAt: faker.date.past(),
                modifiedBy: membersGroup[Math.floor(Math.random() * membersGroup.length)].id,
              };
            },
          );

          const mainTask: InsertTaskModel = {
            id: mainTaskId,
            organizationId: organization.id,
            projectId: project.id,
            summary: `<div class="bn-block-content"><p class="bn-inline-content">${name}</p></div>`,
            keywords: extractKeywords(taskDescription),
            expandable: true,
            // Selection 1-2 random members
            assignedTo: projectMemberships
              .sort(() => 0.5 - Math.random())
              .slice(0, Math.floor(Math.random() * 2) + 1)
              .map((m) => m.userId),
            // Selection 2-4 random labels
            labels: labels
              .sort(() => 0.5 - Math.random())
              .slice(0, Math.floor(Math.random() * 3) + 2)
              .map((l) => l.id),
            slug: faker.helpers.slugify(name).toLowerCase(),
            order: index + 1,
            // random integer between 0 and 6
            status: Math.floor(Math.random() * 7),
            type: faker.helpers.arrayElement(['bug', 'feature', 'chore']),
            // random integer between 0 and 3
            impact: Math.floor(Math.random() * 4),
            description: `<div class="bn-block-content"><p class="bn-inline-content">${name}</p></div><div class="bn-block-content"><p class="bn-inline-content">${taskDescription}</p></div>`,
            createdAt: faker.date.past(),
            createdBy: membersGroup[Math.floor(Math.random() * membersGroup.length)].id,
            modifiedAt: faker.date.past(),
            modifiedBy: membersGroup[Math.floor(Math.random() * membersGroup.length)].id,
          };

          // Combine main task with its subtasks
          return [mainTask, ...insertSubTasks];
        });

        tasksCount += insertTasks.length;
        if (progressCallback) progressCallback('tasks', tasksCount, 'inserting');

        await db.insert(tasksTable).values(insertTasks).onConflictDoNothing();
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
