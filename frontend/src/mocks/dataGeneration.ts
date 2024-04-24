import type { UniqueIdentifier } from '@dnd-kit/core';
import { faker } from '@faker-js/faker';

const roles = ['MEMBER', 'ADMIN'] as const;

const taskGenerator = (projectId: UniqueIdentifier, userIds: UniqueIdentifier[], executor: User, numberOfTasks: number): Task[] => {
  const labels = labelsContent();
  const returnedArray = [] as Task[];
  const type = ['feature', 'bug', 'chore'];
  const points = [0, 1, 2, 3];
  const status = [0, 1, 2, 3, 4, 5, 6];
  for (let i = 0; i < numberOfTasks; i++) {
    returnedArray.push({
      id: faker.string.uuid(),
      slug: faker.animal.bird(),
      text: faker.commerce.productDescription(),
      summary: faker.company.catchPhrase(),
      createdBy: userIds[Math.floor(Math.random() * userIds.length)],
      createdAt: faker.date.anytime(),
      assignedBy: userIds[Math.floor(Math.random() * userIds.length)],
      assignedTo: executor,
      assignedAt: faker.date.anytime(),
      modifiedBy: userIds[Math.floor(Math.random() * userIds.length)],
      modifiedAt: faker.date.anytime(),
      type: type[Math.floor(Math.random() * type.length)] as 'feature' | 'bug' | 'chore',
      points: points[Math.floor(Math.random() * points.length)] as 0 | 1 | 2 | 3,
      status: status[Math.floor(Math.random() * status.length)] as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      labels: labels.map((label) => label.id),
      projectId: projectId,
      workspaceId: faker.string.uuid(),
      organizationId: faker.string.uuid(),
    });
  }

  return returnedArray;
};

export const projectsWithTaskContent = (number: number): ComplexProject[] => {
  const finalArray = [];

  const users = [
    {
      role: 'ADMIN' as const,
      id: faker.string.uuid(),
    },
    {
      role: roles[Math.floor(Math.random() * roles.length)],
      id: faker.string.uuid(),
    },
  ];

  for (let i = 0; i < number; i++) {
    const user = users[Math.floor(Math.random() * users.length)];
    const executor = UserContent();
    const tasksNumber = Math.floor(Math.random() * (18 - 4 + 1)) + 4;

    const projectId = faker.string.uuid();
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
      workspaceId: faker.string.uuid(),
      organizationId: faker.string.uuid(),
      tasks: taskGenerator(
        projectId,
        users.map((user) => user.id),
        executor,
        tasksNumber,
      ),
    });
  }
  return finalArray;
};

// export const labelsContent = (): Label[] => {
//   const group = [null, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
//   return Array.from({ length: 10 }, () => ({
//     id: faker.string.uuid(),
//     slug: faker.animal.fish(),
//     name: faker.person.fullName(),
//     group: group[Math.floor(Math.random() * group.length)],
//   }));
// };

export const labelsContent = (): Label[] => {
  return Array.from({ length: 10 }, () => ({
    id: faker.string.uuid(),
    value: faker.animal.cow(),
    label: faker.animal.cow(),
    color: faker.color.rgb({ casing: 'upper' }),
  }));
};
export const UserContent = (): User => {
  return {
    id: faker.string.uuid(),
    name: faker.person.fullName(),
    thumbnailUrl: null,
    bio: faker.person.bio(),
  };
};

type User = {
  id: UniqueIdentifier;
  name: string;
  thumbnailUrl: null;
  bio: string;
};
type Label = {
  id: UniqueIdentifier;
  value: string;
  label: string;
  color: string;
};

// type Label = {
//   id: UniqueIdentifier;
//   slug: string;
//   name: string;
//   group: number | null;
// };

export type Task = {
  id: UniqueIdentifier;
  slug: string;
  text: string;
  summary: string;
  createdBy: UniqueIdentifier;
  createdAt: Date;
  assignedBy: UniqueIdentifier;
  assignedTo: User;
  assignedAt: Date;
  modifiedBy: UniqueIdentifier;
  modifiedAt: Date;
  type: 'feature' | 'bug' | 'chore';
  points: 0 | 1 | 2 | 3;
  status: 0 | 1 | 2 | 3 | 4 | 5 | 6; //(0 = iced, 1=unstarted, 2=started, 3=finished, 4=delivered, 5=reviewed, 6=accepted )
  labels: UniqueIdentifier[]; //array of labels by id
  projectId: UniqueIdentifier;
  workspaceId: string;
  organizationId: string;
};

export type MockResponse = {
  workspace: { labelGroups: Label[] };
  project: ComplexProject[];
};

export type ComplexProject = {
  id: UniqueIdentifier;
  slug: string;
  name: string;
  color: string;
  role: 'ADMIN' | 'MEMBER';
  createdBy: UniqueIdentifier;
  createdAt: Date;
  modifiedBy: UniqueIdentifier;
  modifiedAt: Date;
  workspaceId: string;
  organizationId: string;
  tasks: Task[];
};
