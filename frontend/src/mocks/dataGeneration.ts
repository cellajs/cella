import type { UniqueIdentifier } from '@dnd-kit/core';
import { faker } from '@faker-js/faker';

const roles = ['MEMBER', 'ADMIN'];

export const projectsContent = (): Project[] => {
  const user = {
    role: roles[Math.floor(Math.random() * roles.length)],
    id: faker.string.uuid(),
  };

  return Array.from({ length: 7 }, () => ({
    id: faker.string.uuid(),
    slug: faker.animal.cat(),
    name: faker.company.name(),
    color: faker.color.human(),
    role: user.role,
    createdBy: user.id,
    createdAt: faker.date.anytime(),
    modifiedBy: user.id,
    modifiedAt: faker.date.anytime(),
    workspaceId: faker.string.uuid(),
    organizationId: faker.string.uuid(),
  }));
};

export const labelsContent = (): Label[] => {
  const group = [null, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  return Array.from({ length: 10 }, () => ({
    id: faker.string.uuid(),
    slug: faker.animal.fish(),
    name: faker.person.fullName(),
    group: group[Math.floor(Math.random() * group.length)],
  }));
};

export const taskContent = (number: number): Task[] => {
  const statusValues = ['todo', 'in-progress', 'done'] as const;
  const labels = labelsContent();
  const finalArray = [] as Task[];
  for (let i = 0; i < number; i++) {
    const type = ['feature', 'bug', 'chore'];
    const points = [0, 1, 2, 3];
    const status = [0, 1, 2, 3, 4, 5, 6];
    const user = {
      id: faker.string.uuid(),
    };

    const executor = {
      id: faker.string.uuid(),
    };
    finalArray.push({
      id: faker.string.uuid(),
      slug: faker.animal.bird(),
      columnId: statusValues[Math.floor(Math.random() * statusValues.length)],
      text: faker.commerce.productDescription(),
      summary: faker.company.catchPhrase(),
      createdBy: user.id,
      createdAt: faker.date.anytime(),
      assignedBy: user.id,
      assignedTo: executor.id,
      assignedAt: faker.date.anytime(),
      modifiedBy: user.id,
      modifiedAt: faker.date.anytime(),
      type: type[Math.floor(Math.random() * type.length)] as 'feature' | 'bug' | 'chore',
      points: points[Math.floor(Math.random() * points.length)] as 0 | 1 | 2 | 3,
      status: status[Math.floor(Math.random() * status.length)] as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      labels: labels.map((label) => label.id),
      projectId: faker.string.uuid(),
      workspaceId: faker.string.uuid(),
      organizationId: faker.string.uuid(),
    });
  }

  return finalArray;
};

type Label = {
  id: UniqueIdentifier;
  slug: string;
  name: string;
  group: number | null;
};

type Project = {
  id: UniqueIdentifier;
  slug: string;
  name: string;
  color: string;
  role: string;
  createdBy: string;
  createdAt: Date;
  modifiedBy: string;
  modifiedAt: Date;
  workspaceId: string;
  organizationId: string;
};

export type Task = {
  id: UniqueIdentifier;
  slug: string;
  text: string;
  columnId: 'todo' | 'in-progress' | 'done';
  summary: string;
  createdBy: string;
  createdAt: Date;
  assignedBy: string;
  assignedTo: string;
  assignedAt: Date;
  modifiedBy: string;
  modifiedAt: Date;
  type: 'feature' | 'bug' | 'chore';
  points: 0 | 1 | 2 | 3;
  status: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  labels: UniqueIdentifier[];
  projectId: string;
  workspaceId: string;
  organizationId: string;
};

export type MockResponse = {
  workspace: { labelGroups: Label[] };
  task: Task[];
  project: Project[];
};
