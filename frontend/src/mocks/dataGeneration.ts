import { faker } from '@faker-js/faker';

const roles = ['MEMBER', 'ADMIN'] as const;

const taskGenerator = (projectId: string, userIds: string[], executor: User, numberOfTasks: number): Task[] => {
  const labels = labelsContent();
  const returnedArray = [] as Task[];
  const type = ['feature', 'bug', 'chore'];
  const impact = [0, 1, 2, 3];
  const status = [0, 1, 2, 3, 4, 5, 6];
  for (let i = 0; i < numberOfTasks; i++) {
    returnedArray.push({
      id: faker.string.uuid(),
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
      type: type[Math.floor(Math.random() * type.length)] as 'feature' | 'bug' | 'chore',
      impact: impact[Math.floor(Math.random() * impact.length)] as 0 | 1 | 2 | 3,
      status: status[Math.floor(Math.random() * status.length)] as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      labels: labels.map((label) => label.id),
      projectId: projectId,
      workspaceId: faker.string.uuid(),
      organizationId: faker.string.uuid(),
    });
  }

  return returnedArray.sort((a, b) => b.status - a.status);
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

export const labelsTable = (): LabelTable[] => {
  const roles = ['secondary', 'primary'] as const;
  const returnedArray: LabelTable[] = [];
  for (let i = 0; i < 10; i++) {
    const count = Math.floor(Math.random() * (40 - 4 + 1)) + 4;
    returnedArray.push({
      id: faker.string.uuid(),
      status: 3,
      count: count,
      name: faker.person.fullName(),
      role: roles[Math.floor(Math.random() * roles.length)],
      lastActive: faker.date.anytime(),
    });
  }
  return returnedArray;
};

export const labelsContent = (): Label[] => {
  return Array.from({ length: 10 }, () => ({
    id: faker.string.uuid(),
    value: faker.hacker.noun().toLowerCase(),
    label: faker.hacker.noun().toLowerCase(),
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

export type User = {
  id: string;
  name: string;
  thumbnailUrl: null;
  bio: string;
};

type Label = {
  id: string;
  value: string;
  label: string;
  color: string;
};

type LabelTable = {
  id: string;
  name: string;
  count: number;
  status: number;
  role: 'secondary' | 'primary';
  lastActive: Date;
};

export type Task = {
  id: string;
  slug: string;
  markdown: string;
  summary: string;
  createdBy: string;
  createdAt: Date;
  assignedBy: string;
  assignedTo: User[];
  assignedAt: Date;
  modifiedBy: string;
  modifiedAt: Date;
  type: 'feature' | 'bug' | 'chore';
  impact: 0 | 1 | 2 | 3;
  status: 0 | 1 | 2 | 3 | 4 | 5 | 6; //(0 = iced, 1=unstarted, 2=started, 3=finished, 4=delivered, 5=reviewed, 6=accepted )
  labels: string[]; //array of labels by id
  projectId: string;
  workspaceId: string;
  organizationId: string;
};

export type MockResponse = {
  workspace: { labelGroups: Label[]; labelsTable: LabelTable[] };
  project: ComplexProject[];
};

export type ComplexProject = {
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
  tasks: Task[];
};
