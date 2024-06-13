import { renderWithTask } from 'hanji';
import { Progress, type State } from '../progressIndication';
import { organizationsSeed } from './organizations';

const OrganizationsState: State = {
  organizations: {
    count: 0,
    name: 'organizations',
    status: 'inserting',
  },
  users: {
    count: 0,
    name: 'users',
    status: 'inserting',
  },
  memberships: {
    count: 0,
    name: 'memberships',
    status: 'inserting',
  },
};

const progress = new Progress(OrganizationsState);

renderWithTask(
  progress,
  organizationsSeed((stage, count, status) => {
    progress.update(stage, count, status);
  })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(() => process.exit(0)),
);
