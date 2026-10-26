import { describe, expect, it } from 'vitest';
import { splitOwnApplication } from './teardown';

const apps = [
  { id: 'app-ci', name: 'cella-production-ci-deploy' },
  { id: 'app-operator', name: 'cella-production-operator' },
  { id: 'app-admin', name: 'cella-production-admin' },
];

describe('splitOwnApplication', () => {
  it('must not hand over the application the run authenticates as: deleting it revokes the key the cleanup runs on', () => {
    const { own, others } = splitOwnApplication(apps, 'app-operator');
    expect(own?.name).toBe('cella-production-operator');
    expect(others.map((app) => app.id)).toEqual(['app-ci', 'app-admin']);
  });

  it('hands over every application for an Owner API key, which belongs to none of them', () => {
    expect(splitOwnApplication(apps, undefined)).toEqual({ own: undefined, others: apps });
  });

  it('hands over every application when the run is another application than the listed ones', () => {
    expect(splitOwnApplication(apps, 'app-elsewhere').others).toHaveLength(3);
  });
});
