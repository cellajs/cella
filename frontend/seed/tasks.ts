import { faker } from '@faker-js/faker';
import { db as mainDb } from 'backend/db/db';
import { db as electricDb } from '../src/db/db';
import { organizationsTable } from 'backend/db/schema/organizations';
import { projectsTable } from 'backend/db/schema/projects';
import { usersTable } from 'backend/db/schema/users';
import { labelsTable, tasksTable, taskLabelsTable } from '../src/db/schema/tasks';
// import { db as electricDb } from '../src/db/db';
import type { InsertWorkspaceModel } from 'backend/db/schema/workspaces';

const main = async () => {
  const organizations = await mainDb.select().from(organizationsTable);

  const insertWorkspaces: InsertWorkspaceModel[] = [];
  for (const organization of organizations) {
    insertWorkspaces.push({
      name: faker.company.buzzNoun(),
      organizationId: organization.id,
      slug: faker.helpers.slugify(faker.company.buzzNoun()),
    });
  }
};

main().catch((error) => {
  console.error(error);
});

// Seed an PROVIDED number tasks to all user projects by provided email
export const tasksSeed = async (email: string, numberOfTasks: number) => {
  const users = await mainDb.select().from(usersTable);

  const neededUser = users.find((user) => user.email === email);

  if (!neededUser) {
    console.info('User with that email does not exist, skipping seed');
    return;
  }

  const userProjects = (await mainDb.select().from(projectsTable)).filter((project) => project.createdBy === neededUser.id);

  if (userProjects.length <= 0) {
    console.info('User does not have projects, skipping seed');
    return;
  }

  for (const project of userProjects) {
    const projectLabels = labelsInTask(project.id, 10);
    projectLabels.map((label) => electricDb.insert(labelsTable).values(label));
    for (let i = 0; i < numberOfTasks; i++) {
      const randomNumber = Math.floor(Math.random() * (8 - 2 + 1)) + 2;
      const taskCreatedLabels = projectLabels.slice(0, randomNumber);
      const task = createTask(neededUser.id, project.id, i, taskCreatedLabels);
      taskCreatedLabels.map((label) => electricDb.insert(taskLabelsTable).values({ taskId: task.id, labelId: label.id }));
      electricDb.insert(tasksTable).values(task);
    }
  }
};

const labelsInTask = (projectId: string, howMuch: number) => {
  return Array.from({ length: howMuch }, () => ({
    id: faker.string.uuid(),
    name: faker.hacker.noun().toLowerCase(),
    color: faker.color.rgb({ casing: 'upper' }),
    projectId: projectId,
  }));
};

const createTask = (
  userId: string,
  projectId: string,
  orderNum: number,
  labels: {
    id: string;
    name: string;
    color: string;
    projectId: string;
  }[],
) => {
  const type = ['feature', 'bug', 'chore'];
  const impact = [0, 1, 2, 3];
  const status = [0, 1, 2, 3, 4, 5, 6];
  return {
    id: faker.string.uuid(),
    slug: faker.animal.bird(),
    markdown: faker.commerce.productDescription(),
    summary: faker.company.catchPhrase(),
    createdBy: userId,
    createdAt: faker.date.anytime(),
    order: orderNum,
    type: type[Math.floor(Math.random() * type.length)] as 'feature' | 'bug' | 'chore',
    impact: impact[Math.floor(Math.random() * impact.length)] as 0 | 1 | 2 | 3,
    status: status[Math.floor(Math.random() * status.length)] as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    labels: labels,
    projectId: projectId,
  };
};
