import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { listRemoteRefs } from '../../lib/deploy/git-remote';
import { rootNodeVersion } from '../../lib/deploy/main-job';
import { pinnedNodeImage } from '../../lib/deploy/node-image';
import { repositoryUrl } from '../../lib/deploy/repository-key';
import { resolveTarget } from '../../lib/deploy/target';
import { deriveInfra } from '../../lib/naming';
import { actionCommand, actionLabel } from '../../lib/operator-actions';
import { RUNNER_FILE, readRunnerFile, withEnvironment, writeRunnerFile } from '../../lib/runner/runner-file';
import { RUNNER_KEY, RUNNER_REPOSITORY_KEY, runnerCloudConfig, runnerName } from '../../lib/runner/runner-machine';
import { createApiKey, deleteApiKey, listApiKeys, resolveApplicationIdByName } from '../../lib/scaleway/iam-client';
import { ipCondition } from '../../lib/scaleway/ip-lock';
import { removeMachines, type ScwServer } from '../../lib/scaleway/machines';
import { RUNNER_PROJECT_PERMISSION_SETS } from '../../lib/scaleway/permissions';
import { extendPolicyReach, readPolicy } from '../../lib/scaleway/policy-reach';
import { createProject, listProjects } from '../../lib/scaleway/scaleway-account';
import { type PolicyRule, provisionScopedKey } from '../../lib/scaleway/scaleway-iam';
import { createSecretManagerClient } from '../../lib/scaleway/scaleway-secret-manager';
import { type ScwAuth, scwFetch, scwSend } from '../../lib/scaleway/scw-fetch';
import { changeMark, checkMark, crossMark, pc, tildeMark, warningMark } from '../../lib/utils/cli-output';
import { infraDir } from '../../lib/utils/paths';
import { extendOperatorReach } from '../../tasks/setup-operator-app';
import { confirmOrDefault, endAction, type InfraContext } from '../shared';
import { acquireIdentityKey, acquirePrivilegedKey } from './operator-unlock';
import { printRevokeReminder } from './owner-key';

// Measured in plan §7: a DEV1-S at a reserved address calls the APIs from that address 37 to 48 s after it is created.
const RUNNER_TYPE = 'DEV1-S';
const RUNNER_IMAGE = 'docker';
const RUNNER_DISK_BYTES = 20_000_000_000;

interface ScwIp {
  id: string;
  address: string;
  tags?: string[];
}

const instanceApi = (zone: string) => `https://api.scaleway.com/instance/v1/zones/${zone}`;

/** The runner's reserved address, found by its tag; undefined before the runner is set up. */
async function findRunnerAddress(auth: ScwAuth, opts: { zone: string; projectId: string; name: string }): Promise<ScwIp | undefined> {
  const { ips = [] } = await scwFetch<{ ips?: ScwIp[] }>(
    auth,
    'GET',
    `${instanceApi(opts.zone)}/ips?project=${opts.projectId}&tags=${encodeURIComponent(opts.name)}`,
  );
  return ips.find((ip) => ip.tags?.includes(opts.name));
}

/** The runner's one rule: start and read job runs in every environment it serves, from its reserved address only. */
function runnerRules(opts: { projectIds: readonly string[]; cidrs: readonly string[] }): PolicyRule[] {
  return [{ permission_set_names: RUNNER_PROJECT_PERMISSION_SETS, project_ids: [...opts.projectIds], condition: ipCondition(opts.cidrs) }];
}

/** The commit this checkout is on: the release a new runner file pins until a person changes it. */
function checkoutCommit(): string {
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: infraDir, encoding: 'utf8' });
  if (head.status !== 0) throw new Error(`git rev-parse HEAD failed: ${head.stderr.trim()}`);
  return head.stdout.trim();
}

/**
 * Set up the runner, at an Owner moment (D5, D28-D30): the organization's runner project and its reserved address, the runner application
 * with the right to start and read job runs in every environment it serves from that address only, the runner key in its project, and the
 * app operator's reach over the runner project; then this environment in `infra/runner.json`. The first run makes the key; a later one
 * extends the policy in place, so the key the running machine holds keeps working, unless `--rotate-key` asks for a new key, which deletes
 * every other key of the runner (it can start the main job of every environment it serves, and so read their deploy keys). The address is
 * made here, though it is no IAM: the policy's condition names it.
 */
export async function runRunnerIdentity(context: InfraContext): Promise<void> {
  const { appConfig, projectId } = context;
  const name = runnerName(appConfig.appSlug);
  const { naming, region, zone, dnsZone } = deriveInfra(appConfig);
  const file = readRunnerFile();
  const entry = { environment: context.environment, projectId, region, definition: naming.resource('main'), repository: repositoryUrl() };
  const environments = withEnvironment(file?.environments ?? [], entry);
  const projectIds = [...new Set(environments.map((environment) => environment.projectId))];
  console.info(
    pc.dim(
      `\n${actionLabel('runner-identity')}: '${name}' starts the deploys of ${environments.map((environment) => environment.definition).join(', ')}.\n`,
    ),
  );

  const rotateKey = process.argv.includes('--rotate-key');
  const ownerKey = await acquireIdentityKey(context, "Setting up the runner writes its application and policy, and the operator's reach.");
  try {
    const { organizationId } = ownerKey;
    const auth = { secretKey: ownerKey.secretKey };
    const project =
      (await listProjects(ownerKey.secretKey, organizationId)).find((candidate) => candidate.name === name) ??
      (await createProject(ownerKey.secretKey, {
        organizationId,
        name,
        description: "The organization's runner: it starts each environment's deploy",
      }));
    let address = await findRunnerAddress(auth, { zone, projectId: project.id, name });
    if (!address) {
      ({ ip: address } = await scwFetch<{ ip: ScwIp }>(auth, 'POST', `${instanceApi(zone)}/ips`, {
        project: project.id,
        type: 'routed_ipv4',
        tags: [name],
      }));
      console.info(`  ${changeMark} Reserved the runner's address ${address.address}.`);
    }
    const cidrs = [`${address.address}/32`];

    const secrets = createSecretManagerClient({ secretKey: ownerKey.secretKey, region, projectId: project.id });
    const stored = await secrets.getSecretByName(RUNNER_KEY.name, RUNNER_KEY.path);
    const policyName = `${name}-policy`;
    if (!(await readPolicy(auth, organizationId, policyName)) || !stored?.version_count) {
      const key = await provisionScopedKey(
        { callerSecretKey: ownerKey.secretKey, organizationId, projectId: project.id, slug: appConfig.appSlug },
        {
          suffix: 'runner',
          appDescription: "The organization's runner: starts each environment's main job, from its reserved address only",
          policyDescription: 'Runner policy: Serverless Jobs in every environment it serves, conditioned on its reserved address (auto-generated)',
          buildRules: () => runnerRules({ projectIds, cidrs }),
        },
      );
      const container = await secrets.ensureSecret({
        name: RUNNER_KEY.name,
        path: RUNNER_KEY.path,
        description: `The runner key, which ${actionLabel('runner-replace')} puts into the runner machine's user data`,
      });
      await secrets.putSecretValue({
        secretId: container.id,
        value: key.secretKey,
        description: 'Written when the runner key was made',
        disablePrevious: true,
      });
      console.info(`  ${changeMark} The runner key is in '${name}', ${RUNNER_KEY.path}/${RUNNER_KEY.name}.`);
    } else {
      const reach = await extendPolicyReach({
        auth,
        organizationId,
        policyName,
        projectSets: RUNNER_PROJECT_PERMISSION_SETS,
        projectIds,
        rules: (next) => runnerRules(next),
      });
      console.info(
        `  ${reach === 'extended' ? changeMark : checkMark} '${name}' ${reach === 'extended' ? 'now reaches' : 'reaches'} ${context.environment}.`,
      );
      if (rotateKey) {
        const applicationId = await resolveApplicationIdByName(auth, organizationId, name);
        if (!applicationId) throw new Error(`no application '${name}' to rotate the key of`);
        const old = await listApiKeys(auth, organizationId, applicationId);
        const key = await createApiKey(auth, { applicationId, description: `${name} key`, defaultProjectId: project.id });
        if (!key.secret_key) throw new Error(`the new key of '${name}' came without its secret`);
        await secrets.putSecretValue({
          secretId: stored.id,
          value: key.secret_key,
          description: 'Written when the runner key was rotated',
          disablePrevious: true,
        });
        for (const previous of old) await deleteApiKey(auth, previous.access_key);
        console.info(
          `  ${changeMark} A new runner key replaced ${old.length} key(s): \`${actionCommand('runner-replace')}\` gives it to the machine.`,
        );
      }
    }

    const operator = await extendOperatorReach({ auth, organizationId, slug: appConfig.appSlug, projectIds: [project.id], dnsZone });
    if (operator === 'absent') {
      console.warn(`${warningMark} The app has no operator yet: \`${actionCommand('operator-key')}\` makes it, then run this again.`);
    } else {
      console.info(`  ${operator === 'extended' ? changeMark : checkMark} The operator reaches '${name}'.`);
    }
    writeRunnerFile({ projectId: project.id, release: file?.release ?? checkoutCommit(), environments });
  } finally {
    await ownerKey.release();
  }
  console.info(
    `${checkMark} ${RUNNER_FILE} lists ${environments.length} environment(s). Commit it; then \`${actionCommand('runner-replace')}\` starts the runner machine with your operator key.`,
  );
  printRevokeReminder();
}

/** The runner's security group: nothing comes in. */
async function ensureSecurityGroup(auth: ScwAuth, opts: { zone: string; projectId: string; name: string }): Promise<string> {
  const { security_groups = [] } = await scwFetch<{ security_groups?: Array<{ id: string; name: string }> }>(
    auth,
    'GET',
    `${instanceApi(opts.zone)}/security_groups?project=${opts.projectId}&name=${encodeURIComponent(opts.name)}`,
  );
  const found = security_groups.find((group) => group.name === opts.name);
  if (found) return found.id;
  const { security_group } = await scwFetch<{ security_group: { id: string } }>(auth, 'POST', `${instanceApi(opts.zone)}/security_groups`, {
    name: opts.name,
    project: opts.projectId,
    description: 'The runner: no inbound traffic',
    stateful: true,
    inbound_default_policy: 'drop',
    outbound_default_policy: 'accept',
    enable_default_security: true,
  });
  return security_group.id;
}

/**
 * Replace the runner machine, on the operator key (D24, D28, D30): delete the one that runs and start one at the reserved address that
 * fetches the release `infra/runner.json` pins and serves its environments, with the runner key in its user data. Nothing changes when the
 * machine runs that release and list already.
 */
export async function runRunnerReplace(context: InfraContext): Promise<void> {
  const file = readRunnerFile();
  if (!file) {
    console.error(`${crossMark} No ${RUNNER_FILE}: \`${actionCommand('runner-identity')}\` sets the runner up, with your Owner API key.`);
    return endAction(1);
  }
  const name = runnerName(context.appConfig.appSlug);
  const { zone, region } = deriveInfra(context.appConfig);
  const repository = repositoryUrl();
  const operator = await acquirePrivilegedKey(context);
  const auth = { secretKey: operator.secretKey };
  const secrets = createSecretManagerClient({ secretKey: operator.secretKey, region, projectId: file.projectId });
  const readKeyStored = await secrets.getSecretByName(RUNNER_REPOSITORY_KEY.name, RUNNER_REPOSITORY_KEY.path);
  const readKey = readKeyStored?.version_count ? (await secrets.accessLatestValue(readKeyStored.id)).trim() : '';
  const release = await resolveTarget({
    environment: name,
    line: { environment: name, rule: { kind: 'pin', ref: file.release }, retry: 0 },
    listRemote: listRemoteRefs(repository, readKey || undefined),
  });
  const tags = [
    `release=${release.sha}`,
    `config=${createHash('sha256').update(JSON.stringify(file.environments)).digest('hex').slice(0, 12)}`,
    `read-key=${readKey ? 'yes' : 'no'}`,
  ];
  const serves = file.environments.map((environment) => environment.definition).join(', ');

  const { servers = [] } = await scwFetch<{ servers?: Array<ScwServer & { tags?: string[] }> }>(
    auth,
    'GET',
    `${instanceApi(zone)}/servers?project=${file.projectId}&name=${encodeURIComponent(name)}`,
  );
  const running = servers.find((server) => server.name === name);
  if (running?.state === 'running' && tags.every((tag) => running.tags?.includes(tag))) {
    console.info(`${checkMark} The runner runs ${release.sha.slice(0, 10)} for ${serves} already.`);
    return;
  }
  console.info(
    `\n${actionLabel('runner-replace')}: ${running ? 'replace' : 'start'} '${name}' with ${release.sha.slice(0, 10)} (${file.release}), serving ${serves}.`,
  );
  if (!(await confirmOrDefault({ message: running ? 'Replace the runner machine?' : 'Start the runner machine?', default: true }))) return;

  const address = await findRunnerAddress(auth, { zone, projectId: file.projectId, name });
  const stored = await secrets.getSecretByName(RUNNER_KEY.name, RUNNER_KEY.path);
  if (!address || !stored?.version_count) {
    console.error(`${crossMark} '${name}' has no ${address ? 'key' : 'address'}: \`${actionCommand('runner-identity')}\` makes it.`);
    return endAction(1);
  }
  const secretKey = (await secrets.accessLatestValue(stored.id)).trim();

  for (const removed of await removeMachines({ secretKey: operator.secretKey, projectId: file.projectId, zone, prefix: name })) {
    console.info(`  ${tildeMark} Deleted ${removed}.`);
  }
  const securityGroup = await ensureSecurityGroup(auth, { zone, projectId: file.projectId, name });
  const { server } = await scwFetch<{ server: ScwServer }>(auth, 'POST', `${instanceApi(zone)}/servers`, {
    name,
    commercial_type: RUNNER_TYPE,
    image: RUNNER_IMAGE,
    project: file.projectId,
    // Its calls leave from the reserved address, the one its key works from.
    public_ips: [address.id],
    dynamic_ip_required: false,
    security_group: securityGroup,
    tags: ['runner', ...tags],
    volumes: { 0: { size: RUNNER_DISK_BYTES, volume_type: 'sbs_volume' } },
  });
  const userData = runnerCloudConfig({
    values: {
      SCW_SECRET_KEY: secretKey,
      RELEASE: release.sha,
      REPO: repository,
      NODE_IMAGE: pinnedNodeImage(rootNodeVersion(), 'bookworm'),
      REPOSITORY_READ_KEY: readKey,
    },
    environments: file.environments,
  });
  const set = await fetch(`${instanceApi(zone)}/servers/${server.id}/user_data/cloud-init`, {
    method: 'PATCH',
    headers: { 'X-Auth-Token': operator.secretKey, 'Content-Type': 'text/plain' },
    body: userData,
  });
  if (!set.ok) throw new Error(`setting the runner's cloud-init → ${set.status}: ${await set.text()}`);
  await scwSend(auth, 'POST', `${instanceApi(zone)}/servers/${server.id}/action`, { action: 'poweron' });
  for (let tries = 0; tries < 36; tries++) {
    const { server: now } = await scwFetch<{ server: ScwServer }>(auth, 'GET', `${instanceApi(zone)}/servers/${server.id}`);
    if (now.state === 'running') {
      console.info(
        `${checkMark} '${name}' runs at ${address.address}: it fetches ${release.sha.slice(0, 10)} and serves ${serves}. Its log is on the serial console (Instances → ${name} → Console).`,
      );
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  console.error(`${crossMark} '${name}' did not reach running in three minutes: see Instances → ${name} in the console.`);
  endAction(1);
}
