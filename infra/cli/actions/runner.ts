import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { listRemoteRefs } from '../../lib/deploy/git-remote';
import { rootNodeVersion } from '../../lib/deploy/main-job';
import { pinnedNodeImage } from '../../lib/deploy/node-image';
import { repositoryUrl } from '../../lib/deploy/repository-key';
import { RELEASE_TAG, resolveTarget } from '../../lib/deploy/target';
import { deriveInfra } from '../../lib/naming';
import { actionCommand, actionLabel, type OperatorActionId } from '../../lib/operator-actions';
import { actionRunner, type Runner, type RunnerFile, runnerFileFlag, withEnvironment, writeRunnerFile } from '../../lib/runner/runner-file';
import { RUNNER_KEY, runnerCloudConfig, runnerReadKey } from '../../lib/runner/runner-machine';
import { createApiKey, deleteApiKey, listApiKeys, resolveApplicationIdByName } from '../../lib/scaleway/iam-client';
import { ipCondition } from '../../lib/scaleway/ip-lock';
import { removeMachine, type ScwServer } from '../../lib/scaleway/machines';
import { RUNNER_PROJECT_PERMISSION_SETS } from '../../lib/scaleway/permissions';
import { extendPolicyReach, readPolicy } from '../../lib/scaleway/policy-reach';
import { createProject, listProjects } from '../../lib/scaleway/scaleway-account';
import { type PolicyRule, provisionScopedKey } from '../../lib/scaleway/scaleway-iam';
import { createSecretManagerClient } from '../../lib/scaleway/scaleway-secret-manager';
import { type ScwAuth, scwFetch, scwSend } from '../../lib/scaleway/scw-fetch';
import { changeMark, checkMark, crossMark, pc, tildeMark, warningMark } from '../../lib/utils/cli-output';
import { infraDir } from '../../lib/utils/paths';
import { readKeyVariable } from '../../runner/src/config';
import { extendOperatorReach } from '../../tasks/setup-operator-app';
import { confirmOrDefault, endAction, type InfraContext } from '../shared';
import { acquireIdentityKey, acquireOperatorKey, acquirePrivilegedKey, type OperatorKey } from './operator-unlock';
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

/** The command of a runner action, with the `--runner-file` an organization's runner needs. */
export function runnerCommand(id: OperatorActionId, runner: Runner): string {
  return `${actionCommand(id)}${runner.organization ? ` --runner-file ${runner.path}` : ''}`;
}

/** The organization's runner `--runner-file` names, once it is set up; undefined without the flag or for a file of an app's own runner. */
export function organizationRunner(appSlug: string): (Runner & { file: RunnerFile }) | undefined {
  const runner = runnerFileFlag() ? actionRunner(appSlug) : undefined;
  if (!runner?.organization) return undefined;
  if (!runner.file) throw new Error(`'${runner.name}' is not set up: \`${runnerCommand('runner-identity', runner)}\` sets it up`);
  return { ...runner, file: runner.file };
}

/** The key that replaces the runner's machine (D30): an organization's runner's own operator (Q1), else the app's. */
export function runnerOperatorKey(context: InfraContext, runner: Runner): Promise<OperatorKey> {
  return runner.organization ? acquireOperatorKey(context, `${runner.name}-operator`) : acquirePrivilegedKey(context);
}

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

/** The oldest release tag of this checkout that contains `sha`; undefined when none does or the checkout lacks the commit. */
function releaseContaining(sha: string): string | undefined {
  const listed = spawnSync('git', ['tag', '--contains', sha, '--sort=v:refname'], { cwd: infraDir, encoding: 'utf8' });
  return listed.status === 0 ? listed.stdout.split('\n').find((tag) => RELEASE_TAG.test(tag)) : undefined;
}

/**
 * Replace the runner key, at an Owner moment: a new key in the runner's project, and every other key of the runner deleted, as it can start
 * the main job of every environment it serves and so read their deploy keys. The running machine holds the deleted key: Replace the runner
 * gives it the new one. Returns how many keys it replaced.
 * @throws when the runner was never set up: it has no application or no stored key.
 */
export async function rotateRunnerKey(
  ownerKey: { secretKey: string; organizationId: string },
  opts: { runner: Runner; region: string },
): Promise<number> {
  const { name, file } = opts.runner;
  const auth = { secretKey: ownerKey.secretKey };
  const applicationId = await resolveApplicationIdByName(auth, ownerKey.organizationId, name);
  const secrets = file ? createSecretManagerClient({ secretKey: ownerKey.secretKey, region: opts.region, projectId: file.projectId }) : undefined;
  const stored = await secrets?.getSecretByName(RUNNER_KEY.name, RUNNER_KEY.path);
  if (!file || !secrets || !applicationId || !stored) {
    throw new Error(
      `'${name}' has no ${applicationId ? 'stored key' : 'application'}: \`${runnerCommand('runner-identity', opts.runner)}\` sets the runner up`,
    );
  }
  const old = await listApiKeys(auth, ownerKey.organizationId, applicationId);
  const key = await createApiKey(auth, { applicationId, description: `${name} key`, defaultProjectId: file.projectId });
  if (!key.secret_key) throw new Error(`the new key of '${name}' came without its secret`);
  await secrets.putSecretValue({
    secretId: stored.id,
    value: key.secret_key,
    description: 'Written when the runner key was rotated',
    disablePrevious: true,
  });
  for (const previous of old) await deleteApiKey(auth, previous.access_key);
  return old.length;
}

/**
 * Set up the runner, at an Owner moment (D28-D30): the runner's project and its reserved address, the runner application with the right to
 * start and read job runs in every environment it serves from that address only, the runner key in its project, and the reach over the
 * runner project of the operator who replaces its machine; then this environment in the runner file. The first run makes the key; a later
 * one extends the policy in place to every project the file lists, so the key the running machine holds keeps working, and a run from a
 * joining app's checkout adds that app. The address is made here, though it is no IAM: the policy's condition names it.
 */
export async function runRunnerIdentity(context: InfraContext): Promise<void> {
  const { appConfig, projectId } = context;
  const runner = actionRunner(appConfig.appSlug);
  const { name, file } = runner;
  const { naming, region, zone, dnsZone } = deriveInfra(appConfig);
  const entry = { environment: context.environment, projectId, region, definition: naming.resource('main'), repository: repositoryUrl() };
  const environments = withEnvironment(file?.environments ?? [], entry);
  const projectIds = [...new Set(environments.map((environment) => environment.projectId))];
  console.info(
    pc.dim(
      `\n${actionLabel('runner-identity')}: '${name}' starts the deploys of ${environments.map((environment) => environment.definition).join(', ')}.\n`,
    ),
  );

  const ownerKey = await acquireIdentityKey(context, "Setting up the runner writes its application and policy, and its operator's reach.");
  try {
    const { organizationId } = ownerKey;
    const auth = { secretKey: ownerKey.secretKey };
    const project =
      (await listProjects(ownerKey.secretKey, organizationId)).find((candidate) => candidate.name === name) ??
      (await createProject(ownerKey.secretKey, {
        organizationId,
        name,
        description: "The runner: it starts each served environment's deploy",
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
        { callerSecretKey: ownerKey.secretKey, organizationId, projectId: project.id, slug: name.slice(0, -'-runner'.length) },
        {
          suffix: 'runner',
          appDescription: "The runner: starts each served environment's main job, from its reserved address only",
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
        `  ${reach === 'extended' ? changeMark : checkMark} '${name}' ${reach === 'extended' ? 'now reaches' : 'reaches'} every project listed.`,
      );
    }

    // An organization's runner has an operator of its own, which reaches no app's DNS (Q1).
    const operatorSlug = runner.organization ? name : appConfig.appSlug;
    const operator = await extendOperatorReach({
      auth,
      organizationId,
      slug: operatorSlug,
      projectIds: [project.id],
      dnsZone: runner.organization ? undefined : dnsZone,
    });
    if (operator === 'absent') {
      console.warn(
        `${warningMark} '${operatorSlug}-operator' does not exist yet: \`${runnerCommand('operator-key', runner)}\` makes it${runner.organization ? '' : ', then run this again'}.`,
      );
    } else {
      console.info(`  ${operator === 'extended' ? changeMark : checkMark} '${operatorSlug}-operator' reaches '${name}'.`);
    }
    writeRunnerFile(runner, { projectId: project.id, release: file?.release ?? checkoutCommit(), environments });
  } finally {
    await ownerKey.release();
  }
  console.info(
    `${checkMark} ${runner.path} lists ${environments.length} environment(s). Commit it; then \`${runnerCommand('runner-replace', runner)}\` starts the runner machine with the key of '${runner.organization ? name : appConfig.appSlug}-operator'.`,
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

/** Whether a machine reaches running within three minutes. */
async function reachesRunning(auth: ScwAuth, zone: string, serverId: string): Promise<boolean> {
  for (let tries = 0; tries < 36; tries++) {
    const { server } = await scwFetch<{ server: ScwServer }>(auth, 'GET', `${instanceApi(zone)}/servers/${serverId}`);
    if (server.state === 'running') return true;
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  return false;
}

/**
 * Replace the runner machine, on its operator's key (D24, D28, D30): start one that fetches the release the runner file pins and serves its
 * environments, with the runner key in its user data, then delete the one that runs. Nothing changes when the machine at the address runs
 * that release and list already. After a rotation of the runner key the machine holds a deleted key, so it is replaced without a question:
 * the rotation asked. An organization's runner runs only a commit a release of this checkout contains (Q3).
 */
export async function runRunnerReplace(context: InfraContext, opts: { afterKeyRotation?: boolean } = {}): Promise<void> {
  const runner = actionRunner(context.appConfig.appSlug);
  const { name, file } = runner;
  if (!file) {
    console.error(
      `${crossMark} ${runner.path} holds no runner: \`${runnerCommand('runner-identity', runner)}\` sets it up, with your Owner API key.`,
    );
    return endAction(1);
  }
  const { zone, region } = deriveInfra(context.appConfig);
  const repository = repositoryUrl();
  const operator = await runnerOperatorKey(context, runner);
  const auth = { secretKey: operator.secretKey };
  const secrets = createSecretManagerClient({ secretKey: operator.secretKey, region, projectId: file.projectId });
  const readKeyOf = async (of: string) => {
    const stored = await secrets.getSecretByName(runnerReadKey(of, runner.organization).name, RUNNER_KEY.path);
    return stored?.version_count ? (await secrets.accessLatestValue(stored.id)).trim() : '';
  };
  // The program's repository's key fetches the program, and the app's own runner reads its one repository with it; an organization's runner
  // reads each private repository it serves with that repository's key (Q6).
  const readKey = await readKeyOf(repository);
  const readKeys: Record<string, string> = {};
  for (const served of runner.organization ? new Set(file.environments.map((environment) => environment.repository)) : []) {
    const key = await readKeyOf(served);
    if (key) readKeys[readKeyVariable(served)] = key;
  }
  const release = await resolveTarget({
    environment: name,
    line: { environment: name, rule: { kind: 'pin', ref: file.release }, retry: 0 },
    listRemote: listRemoteRefs(repository, readKey || undefined),
  });
  const inRelease = runner.organization ? releaseContaining(release.sha) : undefined;
  if (runner.organization && !inRelease) {
    console.error(
      `${crossMark} No release tag of this checkout contains ${release.sha} (${file.release}): pin a released commit, or fetch the tags.`,
    );
    return endAction(1);
  }
  // The read keys count by their hash, so a replaced key replaces the machine and a tag holds nothing that fetches.
  const tags = [
    `release=${release.sha}`,
    `config=${createHash('sha256')
      .update(JSON.stringify([file.environments, readKey, readKeys]))
      .digest('hex')
      .slice(0, 12)}`,
  ];
  const serves = file.environments.map((environment) => environment.definition).join(', ');

  const address = await findRunnerAddress(auth, { zone, projectId: file.projectId, name });
  const { servers = [] } = await scwFetch<{ servers?: Array<ScwServer & { tags?: string[]; public_ips?: Array<{ id: string }> }> }>(
    auth,
    'GET',
    `${instanceApi(zone)}/servers?project=${file.projectId}&name=${encodeURIComponent(name)}`,
  );
  const previous = servers.filter((server) => server.name === name);
  const running = previous.find((server) => server.state === 'running' && server.public_ips?.some((ip) => ip.id === address?.id));
  if (!opts.afterKeyRotation && running && tags.every((tag) => running.tags?.includes(tag))) {
    console.info(`${checkMark} The runner runs ${release.sha.slice(0, 10)} for ${serves} already.`);
    return;
  }
  console.info(
    `\n${actionLabel('runner-replace')}: ${running ? 'replace' : 'start'} '${name}' with ${release.sha.slice(0, 10)} (${file.release}${inRelease ? `, in ${inRelease}` : ''}), serving ${serves}.`,
  );
  const confirmed =
    opts.afterKeyRotation ||
    (await confirmOrDefault({ message: running ? 'Replace the runner machine?' : 'Start the runner machine?', default: true }));
  if (!confirmed) return;

  const stored = await secrets.getSecretByName(RUNNER_KEY.name, RUNNER_KEY.path);
  if (!address || !stored?.version_count) {
    console.error(`${crossMark} '${name}' has no ${address ? 'key' : 'address'}: \`${runnerCommand('runner-identity', runner)}\` makes it.`);
    return endAction(1);
  }
  const secretKey = (await secrets.accessLatestValue(stored.id)).trim();

  // The new machine starts without the address, so the one it replaces serves until Scaleway has started one of this type (Q5).
  const securityGroup = await ensureSecurityGroup(auth, { zone, projectId: file.projectId, name });
  const { server } = await scwFetch<{ server: ScwServer }>(auth, 'POST', `${instanceApi(zone)}/servers`, {
    name,
    commercial_type: RUNNER_TYPE,
    image: RUNNER_IMAGE,
    project: file.projectId,
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
    readKeys,
    environments: file.environments,
  });
  const set = await fetch(`${instanceApi(zone)}/servers/${server.id}/user_data/cloud-init`, {
    method: 'PATCH',
    headers: { 'X-Auth-Token': operator.secretKey, 'Content-Type': 'text/plain' },
    body: userData,
  });
  if (!set.ok) throw new Error(`setting the runner's cloud-init → ${set.status}: ${await set.text()}`);
  const started = await scwSend(auth, 'POST', `${instanceApi(zone)}/servers/${server.id}/action`, { action: 'poweron' }).then(
    () => reachesRunning(auth, zone, server.id),
    () => false,
  );
  if (!started) {
    await removeMachine(auth, zone, server);
    console.error(
      `${crossMark} Scaleway did not start a ${RUNNER_TYPE} in ${zone}, so nothing was replaced${running ? ': the runner keeps serving' : ''}. Try again later.`,
    );
    return endAction(1);
  }
  for (const old of previous) {
    await removeMachine(auth, zone, old);
    console.info(`  ${tildeMark} Deleted the machine it replaces (${old.id}).`);
  }
  // Its calls leave from the reserved address, the one its key works from; it takes the address at its next boot.
  await scwSend(auth, 'PATCH', `${instanceApi(zone)}/ips/${address.id}`, { server: server.id });
  await scwSend(auth, 'POST', `${instanceApi(zone)}/servers/${server.id}/action`, { action: 'reboot' });
  console.info(
    `${checkMark} '${name}' runs at ${address.address}: it fetches ${release.sha.slice(0, 10)} and serves ${serves}. Its log is on the serial console (Instances → ${name} → Console).`,
  );
}

/**
 * Rotate the runner key (Q4): a new key at an Owner moment, every other one deleted, then the machine replaced on its operator's key, as the
 * key reaches the machine only in its user data. An organization's runner's key is rotated here alone: no app's Rotate keys reaches it.
 */
export async function runRunnerRotate(context: InfraContext): Promise<void> {
  const runner = actionRunner(context.appConfig.appSlug);
  const ownerKey = await acquireIdentityKey(context, 'Rotating the runner key replaces the key of its application.');
  try {
    const replaced = await rotateRunnerKey(ownerKey, { runner, region: deriveInfra(context.appConfig).region });
    console.info(`  ${changeMark} A new runner key replaced ${replaced} key(s); the runner machine is replaced next.`);
  } finally {
    await ownerKey.release();
  }
  printRevokeReminder();
  await runRunnerReplace(context, { afterKeyRotation: true });
}
