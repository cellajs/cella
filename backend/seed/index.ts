import { faker } from '@faker-js/faker';
import { UniqueEnforcer } from 'enforce-unique';
import { Argon2id } from 'oslo/password';

import { config } from 'config';
import { db } from '../src/db/db';
import { nanoid } from '../src/lib/nanoid';
import type { Stage, Status } from './data';

import { type InsertMembershipModel, membershipsTable } from '../src/db/schema/memberships';
import { type InsertOrganizationModel, organizationsTable } from '../src/db/schema/organizations';
import { type InsertProjectModel, projectsTable } from '../src/db/schema/projects';
import { type InsertUserModel, usersTable } from '../src/db/schema/users';
import { type InsertWorkspaceModel, workspacesTable } from '../src/db/schema/workspaces';

// Electric schema
import { type InsertLabelModel, labelsTable } from '../src/db/schema-electric/labels';
import { type InsertTaskModel, tasksTable } from '../src/db/schema-electric/tasks';

// Seed an admin user to access app first time
export const userSeed = async () => {
  const usersInTable = await db.select().from(usersTable).limit(1);

  if (usersInTable.length > 0) {
    console.info('Users table is not empty, skipping seed');
    return;
  }
  const password = '12345678';
  const hashedPassword = await new Argon2id().hash(password);
  const email = 'admin-test@cellajs.com';

  await db
    .insert(usersTable)
    .values({
      id: nanoid(),
      email,
      emailVerified: true,
      name: 'Admin User',
      language: config.defaultLanguage,
      slug: 'admin-user',
      role: 'ADMIN',
      hashedPassword,
    })
    .onConflictDoNothing();

  console.info(`Created admin user with verified email ${email} and password ${password}.`);
};

// Seed organizations with data
export const dataSeed = async (progressCallback?: (stage: Stage, count: number, status: Status) => void) => {
  const organizationsInTable = await db.select().from(organizationsTable).limit(1);

  if (organizationsInTable.length > 0) {
    console.info('Organizations table is not empty, skipping seed');
    return;
  }

  const organizationsUniqueEnforcer = new UniqueEnforcer();

  const organizations: (InsertOrganizationModel & {
    id: string;
  })[] = Array.from({
    length: 10,
  }).map(() => {
    const name = organizationsUniqueEnforcer.enforce(() => faker.company.name());

    return {
      id: nanoid(),
      name,
      slug: faker.helpers.slugify(name).toLowerCase(),
      bannerUrl: faker.image.url(),
      brandColor: faker.internet.color(),
      chatSupport: faker.datatype.boolean(),
      country: faker.location.country(),
      createdAt: faker.date.past(),
      logoUrl: faker.image.url(),
      thumbnailUrl: faker.image.url(),
    };
  });

  await db.insert(organizationsTable).values(organizations).onConflictDoNothing();

  const hashedPassword = await new Argon2id().hash('12345678');

  const usersSlugUniqueEnforcer = new UniqueEnforcer();
  const usersEmailUniqueEnforcer = new UniqueEnforcer();

  let usersCount = 0;
  let organizationsCount = 0;
  let workspacesCount = 0;
  let projectsCount = 0;
  let tasksCount = 0;
  let labelsCount = 0;
  let membershipsCount = 0;
  // Create 100 users for each organization
  for (const organization of organizations) {
    organizationsCount++;
    if (progressCallback) {
      progressCallback('organizations', organizationsCount, 'inserting');
    }

    const insertUsers: InsertUserModel[] = Array.from({ length: 100 }).map(() => {
      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const firstAndLastName = { firstName, lastName };

      const name = faker.person.fullName(firstAndLastName);
      const email = usersEmailUniqueEnforcer.enforce(() => faker.internet.email(firstAndLastName).toLocaleLowerCase());
      const slug = usersSlugUniqueEnforcer.enforce(() =>
        faker.internet
          .userName(firstAndLastName)
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '-'),
      );

      return {
        id: nanoid(),
        firstName,
        lastName,
        thumbnailUrl: faker.image.avatar(),
        language: config.defaultLanguage,
        name,
        email,
        hashedPassword,
        slug,
        avatarUrl: faker.image.avatar(),
        createdAt: faker.date.past(),
      };
    });

    usersCount += insertUsers.length;
    if (progressCallback) {
      progressCallback('users', usersCount, 'inserting');
    }

    const users = await db.insert(usersTable).values(insertUsers).returning().onConflictDoNothing();

    // Create 100 memberships for each organization
    const memberships: InsertMembershipModel[] = users.map((user) => {
      return {
        id: nanoid(),
        userId: user.id,
        organizationId: organization.id,
        role: faker.helpers.arrayElement(['ADMIN', 'MEMBER']),
        createdAt: faker.date.past(),
      };
    });

    membershipsCount += memberships.length;
    if (progressCallback) {
      progressCallback('memberships', membershipsCount, 'inserting');
    }

    await db.insert(membershipsTable).values(memberships).onConflictDoNothing();

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
        createdBy: users[Math.floor(Math.random() * users.length)].id,
        modifiedAt: faker.date.past(),
        modifiedBy: users[Math.floor(Math.random() * users.length)].id,
      };
    });

    const workspaces = await db.insert(workspacesTable).values(insertWorkspaces).returning().onConflictDoNothing();

    const groupSize = 10;
    let groupIndex = 0;
    for (const workspace of workspaces) {
      workspacesCount++;
      if (progressCallback) {
        progressCallback('workspaces', workspacesCount, 'inserting');
      }

      // slice users to 10 members for each workspace
      const usersGroup = users.slice(groupIndex * groupSize, (groupIndex + 1) * groupSize);
      groupIndex++;
      const workspaceMemberships: InsertMembershipModel[] = usersGroup.map((user) => {
        return {
          id: nanoid(),
          userId: user.id,
          organizationId: organization.id,
          workspaceId: workspace.id,
          role: faker.helpers.arrayElement(['ADMIN', 'MEMBER']),
          createdAt: faker.date.past(),
        };
      });

      membershipsCount += workspaceMemberships.length;
      if (progressCallback) {
        progressCallback('memberships', membershipsCount, 'inserting');
      }

      await db.insert(membershipsTable).values(workspaceMemberships).onConflictDoNothing();

      const insertProjects: InsertProjectModel[] = Array.from({ length: 3 }).map(() => {
        const name = organizationsUniqueEnforcer.enforce(() => faker.company.name());

        return {
          id: nanoid(),
          organizationId: organization.id,
          workspaceId: workspace.id,
          name,
          color: faker.internet.color(),
          slug: faker.helpers.slugify(name).toLowerCase(),
          createdAt: faker.date.past(),
          createdBy: usersGroup[Math.floor(Math.random() * usersGroup.length)].id,
          modifiedAt: faker.date.past(),
          modifiedBy: usersGroup[Math.floor(Math.random() * usersGroup.length)].id,
        };
      });

      const projects = await db.insert(projectsTable).values(insertProjects).returning().onConflictDoNothing();

      for (const project of projects) {
        projectsCount++;
        if (progressCallback) {
          progressCallback('projects', projectsCount, 'inserting');
        }

        const projectMemberships: InsertMembershipModel[] = usersGroup.map((user) => {
          return {
            id: nanoid(),
            userId: user.id,
            organizationId: organization.id,
            workspaceId: workspace.id,
            projectId: project.id,
            role: faker.helpers.arrayElement(['ADMIN', 'MEMBER']),
            createdAt: faker.date.past(),
          };
        });

        membershipsCount += projectMemberships.length;
        if (progressCallback) {
          progressCallback('memberships', membershipsCount, 'inserting');
        }

        await db.insert(membershipsTable).values(projectMemberships).onConflictDoNothing();

        const insertTasks: InsertTaskModel[] = Array.from({ length: 50 }).map(() => {
          const name = organizationsUniqueEnforcer.enforce(() => faker.company.name());

          return {
            id: nanoid(),
            projectId: project.id,
            summary: name,
            slug: faker.helpers.slugify(name).toLowerCase(),
            // random integer between 0 and 6
            status: Math.floor(Math.random() * 7),
            type: faker.helpers.arrayElement(['bug', 'feature', 'chore']),
            // random integer between 0 and 3
            impact: Math.floor(Math.random() * 4),
            markdown: faker.lorem.paragraphs(),
            createdAt: faker.date.past(),
            createdBy: usersGroup[Math.floor(Math.random() * usersGroup.length)].id,
            modifiedAt: faker.date.past(),
            modifiedBy: usersGroup[Math.floor(Math.random() * usersGroup.length)].id,
            assignedAt: faker.date.past(),
            assignedBy: usersGroup[Math.floor(Math.random() * usersGroup.length)].id,
          };
        });

        tasksCount += insertTasks.length;
        if (progressCallback) {
          progressCallback('tasks', tasksCount, 'inserting');
        }

        await db.insert(tasksTable).values(insertTasks).onConflictDoNothing();

        const insertLabels: InsertLabelModel[] = Array.from({ length: 5 }).map(() => {
          const name = organizationsUniqueEnforcer.enforce(() => faker.company.name());

          return {
            id: nanoid(),
            projectId: project.id,
            name,
            color: faker.internet.color(),
          };
        });

        labelsCount += insertLabels.length;
        if (progressCallback) {
          progressCallback('labels', labelsCount, 'inserting');
        }

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
    progressCallback('users', usersCount, 'done');
    progressCallback('organizations', organizationsCount, 'done');
  }
};
