import { describe, expect, it } from 'vitest';
import { declaredMainJob } from '../../deploy/main-job';
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
  oneKey: ['app-staging-boot', 'app-staging-ci-deploy'],
  machinePrefix: 'app-',
  operator: 'app-operator',
};

describe('the inventory', () => {
  it('finds a planted key, a planted machine (a slot machine the live record does not name or a builder too, when no deploy runs), a planted policy and an application that can act here, and nothing that belongs', () => {
    const facts: InventoryFacts = {
      applications: [
        { id: 'boot', name: 'app-staging-boot' },
        { id: 'ci', name: 'app-staging-ci-deploy' },
        { id: 'op', name: 'app-operator' },
        { id: 'obs', name: 'app-observer' },
        { id: 'other-ci', name: 'other-production-ci-deploy' },
        { id: 'reader', name: 'other-production-admin' },
      ],
      groups: [],
      apiKeys: [
        { access_key: 'SCWBOOT', application_id: 'boot' },
        { access_key: 'SCWPLANTED', application_id: 'boot', description: 'planted' },
        { access_key: 'SCWCI', application_id: 'ci' },
        // Two sittings' one-day keys belong; a key without an end on the operator does not.
        { access_key: 'SCWOP1', application_id: 'op', expires_at: '2026-10-14T20:00:00Z' },
        { access_key: 'SCWOP2', application_id: 'op', expires_at: '2026-10-15T09:00:00Z' },
        { access_key: 'SCWOPDURABLE', application_id: 'op', description: 'forever' },
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
      machines: [
        { id: 'm1', name: 'app-backend-a' },
        { id: 'm0', name: 'app-backend-b', createdAt: '2026-10-14T10:30:00Z' },
        { id: 'b1', name: 'app-builder-abc' },
        { id: 'x1', name: 'mallory' },
        { id: 'x2', name: 'app-backend-1f2e3d4c' },
      ],
      liveMachines: { backend: 'm1' },
      roles: ['backend', 'frontend'],
      mainJob: { env: {} },
      organizationId: 'o',
    };
    expect(inventoryFindings(facts, expect_, Date.parse('2026-10-14T12:00:00Z'))).toEqual({
      applications: ['other-production-ci-deploy: can act in this environment through other-production-ci-deploy-policy: IAMApplicationManager'],
      keys: ['app-staging-boot holds 2 keys: SCWBOOT (no description), SCWPLANTED (planted)'],
      operatorKeys: ['app-operator holds a key that outlives a day: SCWOPDURABLE (forever)'],
      policies: ['boot-extra on app-staging-boot, beside the declared app-vm-boot-policy'],
      machines: [
        'app-backend-b: a machine the live record does not name, older than a deploy runs (a failed run left it, or someone named it so)',
        'app-builder-abc: a builder, older than a deploy runs (a failed run left it, or someone named it so)',
        'mallory: not made by the engine',
        'app-backend-1f2e3d4c: not made by the engine',
      ],
      passing: [],
    });
    // The age is the Instance API's: a lease in the bucket, which the deploy key writes, excuses nothing.
    const young = facts.machines?.map((machine) => ({ ...machine, createdAt: '2026-10-14T11:20:00Z' }));
    const deploying = inventoryFindings({ ...facts, machines: young }, expect_, Date.parse('2026-10-14T12:00:00Z'));
    expect(deploying.machines).toEqual(['mallory: not made by the engine', 'app-backend-1f2e3d4c: not made by the engine']);
    expect(deploying.passing).toEqual([
      'app-backend-b: a machine the live record does not name, a machine a deploy may be making',
      'app-builder-abc: a builder, a machine a deploy may be making',
    ]);
  });

  it("finds a main job edited to read the database's password and to run another image (D-b): a key that starts runs may edit a definition", () => {
    const mainJob = declaredMainJob({
      projectId: 'p-staging',
      organizationId: 'o',
      image: `rg.nl-ams.scw.cloud/app/infra-engine@sha256:${'1'.repeat(64)}`,
      everyMinutes: 1,
    });
    const engine = mainJob.secretFolder;
    const live = {
      imageUri: 'rg.nl-ams.scw.cloud/app/infra-engine:latest',
      command: mainJob.startupCommands.join('\n'),
      cron: mainJob.cron,
      env: { ...mainJob.env, NODE_OPTIONS: '--import=data:text/javascript,0' },
      secretReferences: [
        { env: 'DEPLOY_KEY_JSON', secretId: 's1', name: 'deploy-key', path: engine },
        { env: 'PULUMI_CONFIG_PASSPHRASE', secretId: 's2', name: 'pulumi-passphrase', path: engine },
        { env: 'DB_PASSWORD', secretId: 's3', name: 'database-admin-password', path: engine },
      ],
    };
    // A definition from before the deploy left the state still reads the passphrase: an apply writes it without.
    expect(mainJobDifferences(live, mainJob)).toEqual([
      'image rg.nl-ams.scw.cloud/app/infra-engine:latest',
      'an extra env var NODE_OPTIONS',
      'an extra secret reference PULUMI_CONFIG_PASSPHRASE (pulumi-passphrase)',
      'an extra secret reference DB_PASSWORD (database-admin-password)',
    ]);
  });

  it("declares the environment's cadence as its schedule and finds a main job without it, which deploys nothing by itself", () => {
    const image = `rg.nl-ams.scw.cloud/app/infra-engine@sha256:${'1'.repeat(64)}`;
    expect(declaredMainJob({ projectId: 'p', organizationId: 'o', image, everyMinutes: 5 }).cron).toEqual({
      schedule: '*/5 * * * *',
      timezone: 'Etc/UTC',
    });
    const mainJob = declaredMainJob({ projectId: 'p', organizationId: 'o', image, everyMinutes: 1 });
    expect(mainJob.cron).toEqual({ schedule: '* * * * *', timezone: 'Etc/UTC' });
    const live = { imageUri: mainJob.imageUri, command: mainJob.startupCommands.join('\n'), env: mainJob.env };
    expect(mainJobDifferences(live, mainJob)).toEqual(['no schedule']);
    expect(mainJobDifferences({ ...live, cron: { schedule: '0 * * * *', timezone: 'Etc/UTC' } }, mainJob)).toEqual([
      "schedule '0 * * * *' (Etc/UTC)",
    ]);
    expect(mainJobDifferences({ ...live, cron: mainJob.cron }, mainJob)).toEqual([]);
  });
});
