import { faker } from '@faker-js/faker';
import { nanoid } from '~/lib/utils';
import type { TaskImpact, TaskStatus, TaskType } from '~/modules/projects/create-task-form';

const roles = ['MEMBER', 'ADMIN'] as const;

export type TaskUser = {
  id: string;
  name: string;
  thumbnailUrl: null;
  bio: string;
};

export type TaskLabel = {
  id: string;
  value: string;
  color: string | null;
};

export type Label = {
  id: string;
  value: string;
  color: string | null;
  count: number;
  groupId: string | null;
  lastActive: Date;
  // workspaceId: string;
};

export type Task = {
  id: string;
  slug: string;
  markdown: string;
  summary: string;
  createdBy: string;
  createdAt: Date;
  assignedBy: string;
  assignedTo: TaskUser[];
  assignedAt: Date;
  modifiedBy: string;
  modifiedAt: Date;
  type: TaskType;
  impact: TaskImpact;
  status: TaskStatus;
  labels: TaskLabel[];
  projectId: string;
  // workspaceId: string;
  // organizationId: string;
};

export type Project = {
  id: string;
  slug: string;
  name: string;
  color: string;
  role: 'ADMIN' | 'MEMBER';
  createdBy: string;
  createdAt: Date;
  modifiedBy: string;
  modifiedAt: Date;
  workspaceId: string;
  organizationId: string;
  members: TaskUser[];
};

// This is the mocked API response to get projects
export const getProjects = (number: number): Project[] => {
  const finalArray = [];

  const users = [
    {
      role: 'ADMIN' as const,
      id: nanoid(),
    },
    {
      role: roles[Math.floor(Math.random() * roles.length)],
      id: nanoid(),
    },
  ];

  for (let i = 0; i < number; i++) {
    const user = users[Math.floor(Math.random() * users.length)];
    const projectId = nanoid();
    const canBeAssignedToNumber = Math.floor(Math.random() * (8 - 2 + 1)) + 2;

    finalArray.push({
      id: projectId,
      slug: faker.animal.cat(),
      name: faker.company.name(),
      color: faker.color.human(),
      role: user.role,
      createdBy: user.id,
      createdAt: faker.date.anytime(),
      modifiedBy: user.id,
      modifiedAt: faker.date.anytime(),
      workspaceId: nanoid(),
      organizationId: nanoid(),
      members: usersInTask(canBeAssignedToNumber),
    });
  }
  return finalArray;
};

// This is the mocked API response to get labels for a workspace
export const getLabels = (): Label[] => {
  const returnedArray: Label[] = [];

  for (let i = 0; i < 10; i++) {
    const count = Math.floor(Math.random() * (40 - 4 + 1)) + 4;
    returnedArray.push({
      id: nanoid(),
      color: faker.color.rgb({ casing: 'upper' }),
      count: count,
      value: faker.hacker.noun().toLowerCase(),
      groupId: nanoid(),
      lastActive: faker.date.anytime(),
      // workspaceId: nanoid(),
    });
  }
  return returnedArray;
};

// This is the mocked API response to get all tasks for a workspace
export const getTasks = (projects: Project[]) => {
  const executor = usersInTask(1)[0];
  const numberOfTasks = Math.floor(Math.random() * (18 - 4 + 1)) + 12 * projects.length;

  const tasks: Task[] = [];

  for (const project of projects) {
    const userIds = project.members.map((member) => member.id);
    const labels = labelsInTask();
    const returnedArray = [] as Task[];
    const type = ['feature', 'bug', 'chore'];
    const impact = [0, 1, 2, 3];
    const status = [0, 1, 2, 3, 4, 5, 6];
    for (let i = 0; i < numberOfTasks; i++) {
      returnedArray.push({
        id: nanoid(),
        slug: faker.animal.bird(),
        markdown: faker.commerce.productDescription(),
        summary: faker.company.catchPhrase(),
        createdBy: userIds[Math.floor(Math.random() * userIds.length)],
        createdAt: faker.date.anytime(),
        assignedBy: userIds[Math.floor(Math.random() * userIds.length)],
        assignedTo: [executor],
        assignedAt: faker.date.anytime(),
        modifiedBy: userIds[Math.floor(Math.random() * userIds.length)],
        modifiedAt: faker.date.anytime(),
        type: type[Math.floor(Math.random() * type.length)] as TaskType,
        impact: impact[Math.floor(Math.random() * impact.length)] as TaskImpact,
        status: status[Math.floor(Math.random() * status.length)] as TaskStatus,
        labels: labels,
        projectId: project.id,
        // workspaceId: project.workspaceId,
        //  organizationId: project.id,
      });
    }

    tasks.push(...returnedArray);
  }

  return tasks.sort((a, b) => b.status - a.status);
};

export const labelsInTask = (): TaskLabel[] => {
  return Array.from({ length: 3 }, () => ({
    id: nanoid(),
    value: faker.hacker.noun().toLowerCase(),
    color: faker.color.rgb({ casing: 'upper' }),
  }));
};

export const usersInTask = (number: number): TaskUser[] => {
  return Array.from({ length: number }, () => ({
    id: nanoid(),
    name: faker.person.fullName(),
    thumbnailUrl: null,
    bio: faker.person.bio(),
  }));
};
