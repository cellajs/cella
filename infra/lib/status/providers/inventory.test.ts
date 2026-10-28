import { describe, expect, it } from 'vitest';
import { declaredMainJob, MAIN_JOB_SCRIPT } from '../../deploy/main-job';
import { type InventoryFacts, inventoryFindings, mainJobDifferences } from './inventory';

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
  operator: 'app-operator',
};

describe('the inventory', () => {
  it('finds a planted key, a planted machine (a stale generation or builder too, when no deploy runs), a planted policy and an application that can act here, and nothing that belongs (C11)', () => {
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
      machines: ['app-backend-g1', 'app-backend-g0', 'app-builder-abc', 'mallory'],
      activeGenerations: { backend: 'g1' },
      mainJob: { running: false, env: {} },
      organizationId: 'o',
    };
    expect(inventoryFindings(facts, expect_)).toEqual({
      applications: ['other-production-ci-deploy: can act in this environment through other-production-ci-deploy-policy: IAMApplicationManager'],
      keys: ['app-staging-boot holds 2 keys: SCWBOOT (no description), SCWPLANTED (planted)'],
      operatorKeys: [],
      policies: ['boot-extra on app-staging-boot, beside the declared app-vm-boot-policy'],
      machines: [
        'app-backend-g0: a generation that is not active, and no deploy runs (a failed run left it, or someone named it so)',
        'app-builder-abc: a builder, and no deploy runs (a failed run left it, or someone named it so)',
        'mallory: not made by the engine',
      ],
      passing: [],
    });
    const deploying = inventoryFindings({ ...facts, mainJob: { running: true, env: {} } }, expect_);
    expect(deploying.machines).toEqual(['mallory: not made by the engine']);
    expect(deploying.passing).toEqual([
      'app-backend-g0: a generation that is not active, while a deploy runs',
      'app-builder-abc: a builder, while a deploy runs',
    ]);
  });

  it("finds a main job edited to read the database's password and to fetch another repository (D-b): the runner key may edit a definition", () => {
    const mainJob = declaredMainJob({
      slug: 'app',
      mode: 'staging',
      projectId: 'p-staging',
      organizationId: 'o',
      region: 'nl-ams',
      repository: 'https://github.com/example/app.git',
      nodeVersion: '26.12.1',
    });
    const engine = mainJob.secretFolder;
    const live = {
      running: false,
      imageUri: mainJob.imageUri,
      command: `bash -c ${MAIN_JOB_SCRIPT}`,
      env: { ...mainJob.env, REPO: 'https://github.com/mallory/app.git' },
      secretReferences: [
        { env: 'DEPLOY_KEY_JSON', secretId: 's1', name: 'deploy-key', path: engine },
        { env: 'PULUMI_CONFIG_PASSPHRASE', secretId: 's2', name: 'pulumi-passphrase', path: engine },
        { env: 'DB_PASSWORD', secretId: 's3', name: 'database-admin-password', path: engine },
      ],
    };
    expect(mainJobDifferences(live, mainJob)).toEqual(['env REPO differs', 'an extra secret reference DB_PASSWORD (database-admin-password)']);
  });
});
