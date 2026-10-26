import { describe, expect, it } from 'vitest';
import { type InventoryFacts, inventoryFindings } from './inventory';

const expect_ = {
  projectId: 'p-staging',
  environmentPrefix: 'app-staging-',
  declared: {
    'app-staging-boot': 'app-vm-boot-policy',
    'app-staging-ci-deploy': 'app-staging-ci-deploy-policy',
    'app-operator': 'app-operator-policy',
    'app-observer': 'app-observer-policy',
  },
  oneKey: ['app-staging-boot', 'app-staging-ci-deploy', 'app-operator'],
  machinePrefix: 'app-',
};

describe('the inventory', () => {
  it('finds a planted key, a planted machine, a planted policy and an application that can act here, and nothing that belongs (C11)', () => {
    const facts: InventoryFacts = {
      applications: [
        { id: 'boot', name: 'app-staging-boot' },
        { id: 'ci', name: 'app-staging-ci-deploy' },
        { id: 'obs', name: 'app-observer' },
        { id: 'other-ci', name: 'other-production-ci-deploy' },
        { id: 'reader', name: 'other-production-admin' },
      ],
      groups: [],
      apiKeys: [
        { access_key: 'SCWBOOT', application_id: 'boot' },
        { access_key: 'SCWPLANTED', application_id: 'boot', description: 'planted' },
        { access_key: 'SCWCI', application_id: 'ci' },
        { access_key: 'SCWOBS1', application_id: 'obs' },
        { access_key: 'SCWOBS2', application_id: 'obs' },
      ],
      policies: [
        {
          name: 'app-vm-boot-policy',
          application_id: 'boot',
          rules: [{ project_ids: ['p-staging'], permission_set_names: ['ContainerRegistryReadOnly'] }],
        },
        { name: 'boot-extra', application_id: 'boot', rules: [{ project_ids: ['p-staging'], permission_set_names: ['SecretManagerFullAccess'] }] },
        {
          name: 'other-production-ci-deploy-policy',
          application_id: 'other-ci',
          rules: [{ organization_id: 'o', permission_set_names: ['IAMApplicationManager'] }],
        },
        { name: 'other-production-admin-policy', application_id: 'reader', rules: [{ organization_id: 'o', permission_set_names: ['IAMReadOnly'] }] },
      ],
      machines: ['app-backend-g1', 'app-builder-abc', 'mallory'],
      activeGenerations: { backend: 'g1' },
    };
    expect(inventoryFindings(facts, expect_)).toEqual({
      applications: ['other-production-ci-deploy: can act in this environment through other-production-ci-deploy-policy: IAMApplicationManager'],
      keys: ['app-staging-boot holds 2 keys: SCWBOOT (no description), SCWPLANTED (planted)'],
      policies: ['boot-extra on app-staging-boot, beside the declared app-vm-boot-policy'],
      machines: ['mallory: not made by the engine'],
      passing: ['app-builder-abc: a builder (a deploy runs, or the next one deletes it)'],
    });
  });
});
