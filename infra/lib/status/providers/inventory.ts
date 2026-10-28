import { findJobDefinition, listJobRuns, readJobDefinition, readJobDefinitionSecrets, runEnded } from '../../deploy/job-runs';
import { declaredMainJob, MAIN_JOB_SCRIPT, type MainJobDeclaration, rootNodeVersion } from '../../deploy/main-job';
import { repositoryUrl } from '../../deploy/repository-key';
import { deriveInfra } from '../../naming';
import { actionCommand, actionLabel } from '../../operator-actions';
import { runnerName } from '../../runner/runner-machine';
import { declaredIdentities } from '../../scaleway/declared-identities';
import { IAM_BASE, listOrganizationPolicies } from '../../scaleway/iam-client';
import { organizationIdOfKey } from '../../scaleway/operator-identity';
import { appPrincipalNames } from '../../scaleway/principals';
import { scwFetch } from '../../scaleway/scw-fetch';
import { type CheckBuilder, check, probed } from '../check';
import type { Check, NextAction, StatusProvider } from '../types';

/** A policy as the inventory reads it: its principal, and where each of its rules reaches. */
interface InventoryPolicy {
  name: string;
  application_id?: string;
  group_id?: string;
  rules: Array<{ permission_set_names?: string[]; project_ids?: string[] | null; organization_id?: string | null }>;
}

/** What exists, as IAM lists it for the organization and the Instance API for the environment's project. */
export interface InventoryFacts {
  applications: Array<{ id: string; name: string }>;
  groups: Array<{ id: string; name: string; application_ids?: string[] }>;
  apiKeys: Array<{ access_key: string; application_id?: string | null; user_id?: string | null; description?: string; expires_at?: string | null }>;
  /** The policies bound to an application or a group, with their rules. */
  policies: InventoryPolicy[];
  /** The project's machines, in every zone of the region. */
  machines: string[];
  /** Each service's active generation, from the control object. */
  activeGenerations: Record<string, string>;
  /** Whether a run of the main job runs now, and what its definition runs; undefined when the environment has no main job. */
  mainJob?: {
    running: boolean;
    imageUri?: string;
    command?: string;
    env: Record<string, string>;
    /** Each secret it references, with the name and folder Secret Manager gives it; undefined when they could not be read. */
    secretReferences?: Array<{ env?: string; file?: string; secretId: string; name?: string; path?: string }>;
  };
  /** The organization the key belongs to, which the main job's definition names. */
  organizationId: string;
}

/** What an environment's code declares (C11): its applications, the ones that hold one key, its project and how its machines are named. */
export interface InventoryExpectation {
  projectId: string;
  /** Every application name of this environment starts with it (`<slug>-<mode>-`). */
  environmentPrefix: string;
  /** This environment's applications and the app's own (operator, observer, runner), each with the name of its one policy. */
  declared: Readonly<Record<string, string>>;
  /** Applications that hold exactly one key; the observer holds one per machine it was put on. */
  oneKey: readonly string[];
  /** Every machine of this environment starts with it (`<slug>-`). */
  machinePrefix: string;
  /** The app's operator: Set up operator key removes its extra key, Rotate keys every other. */
  operator: string;
}

export interface InventoryFindings {
  applications: string[];
  /** An extra key that Rotate keys removes, or a person's key without an end date. */
  keys: string[];
  /** An extra key of the operator, which Set up operator key replaces. */
  operatorKeys: string[];
  policies: string[];
  /** A machine the engine did not make. */
  machines: string[];
  /** A machine the engine made that is not live while a deploy runs: a generation not yet reaped, or a builder. */
  passing: string[];
}

/**
 * The difference between what an environment declares and what exists (C11), as an Owner checks after a suspected break-in: an application
 * the environment does not declare that can act in its project (by a rule on the project or on the organization, its own or a group's), an
 * extra key or policy on one it declares, a person's key without an end date, and a machine the engine did not make. Policies bound to
 * people are the Owner's to judge in the console.
 */
export function inventoryFindings(facts: InventoryFacts, expect: InventoryExpectation): InventoryFindings {
  const found: InventoryFindings = { applications: [], keys: [], operatorKeys: [], policies: [], machines: [], passing: [] };
  const nameOf = new Map(facts.applications.map((application) => [application.id, application.name]));
  const own = new Set(facts.applications.filter((application) => application.name in expect.declared).map((application) => application.id));
  for (const application of facts.applications) {
    if (!own.has(application.id) && application.name.startsWith(expect.environmentPrefix)) {
      found.applications.push(`${application.name}: named for this environment, and not declared`);
    }
  }
  // A rule on the project acts in it; a rule on the organization does too unless it only reads, as a write set there (IAMApplicationManager
  // among them) can reach this project or grant the right to.
  const reaching = (policy: InventoryPolicy) =>
    policy.rules.filter(
      (rule) =>
        rule.project_ids?.includes(expect.projectId) ||
        (rule.organization_id && (rule.permission_set_names ?? []).some((set) => !set.endsWith('ReadOnly'))),
    );
  const reported = new Set<string>();
  for (const policy of facts.policies) {
    const bound = policy.application_id;
    const declared = bound && own.has(bound) ? expect.declared[nameOf.get(bound) ?? ''] : undefined;
    if (declared && policy.name !== declared) found.policies.push(`${policy.name} on ${nameOf.get(bound ?? '')}, beside the declared ${declared}`);
    const rules = reaching(policy);
    if (rules.length === 0) continue;
    const group = policy.group_id ? facts.groups.find((candidate) => candidate.id === policy.group_id) : undefined;
    for (const id of bound ? [bound] : (group?.application_ids ?? [])) {
      if (own.has(id) || reported.has(id)) continue;
      reported.add(id);
      const sets = [...new Set(rules.flatMap((rule) => rule.permission_set_names ?? []))].join(', ');
      found.applications.push(
        `${nameOf.get(id) ?? id}: can act in this environment through ${policy.name}${group ? ` (group ${group.name})` : ''}: ${sets}`,
      );
    }
  }
  const keysOf = new Map<string, typeof facts.apiKeys>();
  for (const key of facts.apiKeys) {
    if (key.user_id && !key.expires_at)
      found.keys.push(`a person's key without an end date: ${key.access_key} (${key.description || 'no description'})`);
    if (key.application_id && own.has(key.application_id)) keysOf.set(key.application_id, [...(keysOf.get(key.application_id) ?? []), key]);
  }
  for (const [id, keys] of keysOf) {
    const name = nameOf.get(id) ?? id;
    if (expect.oneKey.includes(name) && keys.length > 1) {
      (name === expect.operator ? found.operatorKeys : found.keys).push(
        `${name} holds ${keys.length} keys: ${keys.map((key) => `${key.access_key} (${key.description || 'no description'})`).join(', ')}`,
      );
    }
  }
  const live = new Set(Object.entries(facts.activeGenerations).map(([service, id]) => `${expect.machinePrefix}${service}-${id}`));
  const services = Object.keys(facts.activeGenerations);
  // A deploy reaps what it displaced and deletes its builder before it ends, so with no run going on such a machine is a finding too.
  const deploying = facts.mainJob?.running === true;
  for (const machine of facts.machines) {
    if (live.has(machine)) continue;
    const kind = machine.startsWith(`${expect.machinePrefix}builder-`)
      ? 'a builder'
      : services.some((service) => machine.startsWith(`${expect.machinePrefix}${service}-`))
        ? 'a generation that is not active'
        : undefined;
    if (!kind) found.machines.push(`${machine}: not made by the engine`);
    else if (deploying) found.passing.push(`${machine}: ${kind}, while a deploy runs`);
    else found.machines.push(`${machine}: ${kind}, and no deploy runs (a failed run left it, or someone named it so)`);
  }
  return found;
}

const folderOf = (path: string | undefined) => (path ?? '').replace(/\/+$/, '');

/**
 * Where a definition differs from the declared one (D-b): the runner key may edit it, and a run of an edited one reads the deploy key and the
 * passphrase. The image, the command, every env value, an env var it adds, and each secret reference: one outside the engine folder, one the
 * declaration does not name, one that reads another secret, and a required one that is gone.
 */
export function mainJobDifferences(live: NonNullable<InventoryFacts['mainJob']>, declared: MainJobDeclaration): string[] {
  const differs: string[] = [];
  if (live.imageUri !== declared.imageUri) differs.push(`image ${live.imageUri}`);
  if (!live.command?.includes(MAIN_JOB_SCRIPT.trim())) differs.push('its command');
  for (const [name, value] of Object.entries(declared.env)) {
    if (live.env[name] !== value) differs.push(name in live.env ? `env ${name} differs` : `env ${name} is missing`);
  }
  for (const name of Object.keys(live.env)) if (!(name in declared.env)) differs.push(`an extra env var ${name}`);
  for (const reference of live.secretReferences ?? []) {
    const where = reference.env ?? reference.file ?? reference.secretId;
    const expected = reference.env ? declared.secretReferences[reference.env] : undefined;
    if (folderOf(reference.path) !== folderOf(declared.secretFolder)) {
      differs.push(
        `${where} reads a secret outside the engine folder (${reference.path ? `${reference.path}/${reference.name}` : reference.secretId})`,
      );
    } else if (!expected) differs.push(`an extra secret reference ${where} (${reference.name})`);
    else if (expected.name !== reference.name) differs.push(`${where} reads ${reference.name}, not ${expected.name}`);
  }
  for (const [env, { name, optional }] of Object.entries(declared.secretReferences)) {
    if (live.secretReferences && !optional && !live.secretReferences.some((reference) => reference.env === env)) {
      differs.push(`the secret reference ${env} (${name}) is missing`);
    }
  }
  return differs;
}

/** Whether the main job's definition runs what this checkout declares: a difference is an apply owed, or an edit nobody declared. */
function mainJobVerdict(builder: CheckBuilder, mainJob: InventoryFacts['mainJob'], declared: () => MainJobDeclaration): Check {
  if (!mainJob) return builder.ok('no main job yet');
  if (!mainJob.command || !mainJob.imageUri) return builder.warn('its command or image could not be read');
  const differs = mainJobDifferences(mainJob, declared());
  if (differs.length > 0) {
    return builder.error(`${differs.join('; ')}: an apply is owed, or someone edited the definition`, {
      description: 'An apply writes the declared definition again',
      command: actionCommand('apply'),
    });
  }
  if (!mainJob.secretReferences) return builder.warn('runs the declared script, image and env; its secret references could not be read');
  return builder.ok('runs the declared script, image, env and secret references');
}

/** The environment's expectation, from the identities Update identities writes and the app's own, named `<application>-policy`. */
function expectationOf(appConfig: { slug: string; appSlug: string }, mode: string, projectId: string): InventoryExpectation {
  const app = appPrincipalNames(appConfig.appSlug);
  const appLevel = [app.operator, app.observer, runnerName(appConfig.appSlug)];
  const declared = Object.fromEntries([
    ...declaredIdentities({ slug: appConfig.slug, mode }, { projectId, organizationId: '' }).policies.map((policy) => [
      policy.applicationName,
      policy.name,
    ]),
    ...appLevel.map((name) => [name, `${name}-policy`]),
  ]);
  return {
    projectId,
    environmentPrefix: `${appConfig.slug}-${mode}-`,
    declared,
    oneKey: Object.keys(declared).filter((name) => name !== app.observer),
    machinePrefix: `${appConfig.slug}-`,
    operator: app.operator,
  };
}

async function listAll<T>(auth: { secretKey: string }, url: (page: number) => string, field: string): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; page <= 100; page++) {
    const body = await scwFetch<Record<string, unknown>>(auth, 'GET', url(page));
    const items = (body[field] as T[] | undefined) ?? [];
    all.push(...items);
    if (items.length === 0 || all.length >= Number(body.total_count ?? 0)) break;
  }
  return all;
}

/**
 * The inventory (plan §4.2, phase 8b): what can act in the environment and what runs in its project, against what the code declares, read on
 * the observer key. Rotate keys deletes every key beside the declared ones; an application, a policy or a machine the engine did not make is
 * removed in the console once it is known who made it.
 */
export const inventoryProvider: StatusProvider<InventoryFacts> = {
  domain: 'inventory',
  async gather(session) {
    if (session.stackState !== 'bootstrapped') return undefined;
    if (!session.scalewayKeyAvailable || !session.accessKey || !session.secretKey || !session.projectId) return undefined;
    try {
      const organizationId = await organizationIdOfKey({ accessKey: session.accessKey, secretKey: session.secretKey }, session.projectId);
      const auth = { secretKey: session.secretKey };
      const { naming, region } = deriveInfra(session.appConfig);
      const rollout = (await session.scalewayFacts()).rollout;
      if (!rollout) return undefined;
      // Every zone of the region: a machine an intruder made in another zone of the project is still the project's.
      const zones = [1, 2, 3].map((index) => `${region}-${index}`);
      const org = (path: string) => (page: number) => `${IAM_BASE}/${path}?organization_id=${organizationId}&page=${page}&page_size=100`;
      // A referenced secret's name and folder, which the observer reads as metadata; one it cannot read keeps neither.
      const secretPlace = (secretId: string) =>
        scwFetch<{ name: string; path: string }>(
          auth,
          'GET',
          `https://api.scaleway.com/secret-manager/v1beta1/regions/${region}/secrets/${secretId}`,
        ).then(
          ({ name, path }) => ({ name, path }),
          () => ({}),
        );
      const [applications, groups, apiKeys, policies, servers, mainJob] = await Promise.all([
        listAll<InventoryFacts['applications'][number]>(auth, org('applications'), 'applications'),
        listAll<InventoryFacts['groups'][number]>(auth, org('groups'), 'groups'),
        listAll<InventoryFacts['apiKeys'][number]>(auth, org('api-keys'), 'api_keys'),
        listOrganizationPolicies(auth, organizationId),
        Promise.all(
          zones.map((zone) =>
            listAll<{ name: string }>(
              auth,
              (page) => `https://api.scaleway.com/instance/v1/zones/${zone}/servers?project=${session.projectId}&page=${page}&per_page=100`,
              'servers',
            ),
          ),
        ).then((perZone) => perZone.flat()),
        findJobDefinition(auth, { region, projectId: session.projectId, name: naming.resource('main') }).then(async (definitionId) => {
          if (!definitionId) return undefined;
          const [runs, definition, secretReferences] = await Promise.all([
            listJobRuns(auth, { region, projectId: session.projectId ?? '', definitionId }),
            readJobDefinition(auth, { region, definitionId }),
            readJobDefinitionSecrets(auth, { region, definitionId })
              .then((references) => Promise.all(references.map(async (reference) => ({ ...reference, ...(await secretPlace(reference.secretId)) }))))
              .catch(() => undefined),
          ]);
          const { imageUri, command, env } = definition;
          return { running: runs.some((run) => !runEnded(run)), imageUri, command, env, secretReferences };
        }),
      ]);
      const withRules = await Promise.all(
        policies
          .filter((policy) => policy.application_id || policy.group_id)
          .map(async (policy) => ({
            ...policy,
            rules:
              (await scwFetch<{ rules?: InventoryPolicy['rules'] }>(auth, 'GET', `${IAM_BASE}/rules?policy_id=${policy.id}&page_size=100`)).rules ??
              [],
          })),
      );
      const activeGenerations = Object.fromEntries(rollout.flatMap((row) => (row.activeGeneration ? [[row.slug, row.activeGeneration]] : [])));
      const machines = servers.map((server) => server.name);
      return { applications, groups, apiKeys, policies: withRules, machines, activeGenerations, mainJob, organizationId };
    } catch {
      return undefined;
    }
  },
  evaluate(facts, session) {
    if (session.stackState !== 'bootstrapped') return [];
    const read =
      facts && session.projectId
        ? { facts, found: inventoryFindings(facts, expectationOf(session.appConfig, session.mode, session.projectId)) }
        : undefined;
    const item = (id: string, title: string, verdict: (builder: CheckBuilder, value: NonNullable<typeof read>) => Check): Check => {
      const builder = check(id, title, 'scaleway');
      return probed(builder, session.scalewayKeyAvailable, read, 'could not read IAM or the machines', (value) => verdict(builder, value));
    };
    const listed = (builder: CheckBuilder, lines: string[], fine: string, nextAction?: NextAction) =>
      lines.length === 0 ? builder.ok(fine) : builder.error(lines.join('; '), nextAction);
    const rotate = { description: 'Rotate keys deletes every key beside the declared ones', command: actionCommand('rotate-keys') };
    const operatorKey = { description: `${actionLabel('operator-key')} replaces every key of the operator`, command: actionCommand('operator-key') };
    return [
      item('inventory.applications', 'Applications', (b, { found }) => listed(b, found.applications, 'only the declared ones can act here')),
      item('inventory.keys', 'API keys', (b, { found }) =>
        listed(
          b,
          [...found.keys, ...found.operatorKeys.map((line) => `${line}, which ${actionLabel('operator-key')} removes`)],
          'one key per identity, as declared',
          found.keys.length > 0 ? rotate : operatorKey,
        ),
      ),
      item('inventory.policies', 'Policies', (b, { found }) => listed(b, found.policies, 'one per identity, as declared')),
      item('inventory.machines', 'Machines', (b, { facts, found }) =>
        found.machines.length > 0
          ? b.error(found.machines.join('; '))
          : found.passing.length > 0
            ? b.warn(found.passing.join('; '))
            : b.ok(`${facts.machines.length} machine(s), each an active generation`),
      ),
      item('inventory.mainJob', 'Main job', (b, { facts }) =>
        mainJobVerdict(b, facts.mainJob, () =>
          declaredMainJob({
            slug: session.appConfig.slug,
            mode: session.mode,
            projectId: session.projectId ?? '',
            organizationId: facts.organizationId,
            region: deriveInfra(session.appConfig).region,
            repository: repositoryUrl(),
            nodeVersion: rootNodeVersion(),
          }),
        ),
      ),
    ];
  },
};
