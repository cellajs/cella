import { renderWithTask } from 'hanji';
import { Progress, type State } from '../progress';
import { dataSeed } from './seed';

const DataState: State = {
  workspaces: {
    count: 0,
    name: 'workspaces',
    status: 'inserting',
  },
  projects: {
    count: 0,
    name: 'projects',
    status: 'inserting',
  },
  tasks: {
    count: 0,
    name: 'tasks ⚡',
    status: 'inserting',
  },
  labels: {
    count: 0,
    name: 'labels ⚡',
    status: 'inserting',
  },
  memberships: {
    count: 0,
    name: 'memberships',
    status: 'inserting',
  },
};

const progress = new Progress(DataState);

renderWithTask(
  progress,
  dataSeed((stage, count, status) => {
    progress.update(stage, count, status);
  })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(() => process.exit(0)),
);
