import { blockedValues } from '../../lib/deploy/failure-class';
import { bucketRunStore } from '../../lib/deploy/run-store';
import { type ManagedKeyDefinition, managedKeys } from '../../lib/managed-keys';
import { deriveInfra } from '../../lib/naming';
import { actionLabel } from '../../lib/operator-actions';
import { type RuntimeSecretDefinition, runtimeSecrets } from '../../lib/runtime-secrets';
import { type KeyPair, resolveOperatorIdentity } from '../../lib/scaleway/operator-identity';
import { makeS3Client, stateKeyOf } from '../../lib/scaleway/s3-client';
import { createSecretManagerClient, type SecretManagerSecret } from '../../lib/scaleway/scaleway-secret-manager';
import { controlActor, makeControlClient, recordRotation } from '../../lib/stack/control-store';
import { checkMark, pc, tildeMark, warningMark } from '../../lib/utils/cli-output';
import { isEnvFileDeliverable } from '../../lib/utils/env-file';
import { errorMessage } from '../../lib/utils/errors';
import {
  formatSecretsTable,
  type RuntimeContainer,
  readContainers,
  type SecretManagerClient,
  type SecretRow,
  secretRow,
  secretsTable,
  setValue,
} from '../../tasks/manage-runtime-secrets';
import { provisionManagedKey } from '../../tasks/provision-managed-key';
import { BACK, type MenuChoice, RULE } from '../menu';
import { isPromptAbort } from '../prompts/abort';
import { confirm, PromptBack } from '../prompts/back';
import { maskedSecret } from '../prompts/masked-secret';
import { ESCAPED, type MenuSelectOptions, menuSelect } from '../prompts/menu-select';
import { leaveRow } from '../prompts/what-now';
import {
  ActionEnded,
  acquireStackLockOrExit,
  autoAcceptDefaults,
  confirmOrDefault,
  endsAction,
  type InfraContext,
  pointTo,
  stackNameFor,
} from '../shared';
import { acquireIdentityKey, acquireOperatorKey, type OperatorKey } from './operator-unlock';
import { type OwnerKey, printRevokeReminder } from './owner-key';
import { lastSecretsRotation, runRotateSecrets } from './rotate-secrets';
import { redeployAfterRotation, startBlockedTarget } from './start-deploy';

/** The prompts of the pick: Esc in a select steps back and resolves to {@link ESCAPED}. */
export interface SecretsPrompts {
  select<T extends string>(options: MenuSelectOptions<T>): Promise<T | typeof ESCAPED>;
  password(options: { message: string; validate?: (value: string) => true | string }): Promise<string>;
  confirm(options: { message: string; default?: boolean }): Promise<boolean>;
}

export interface SecretsMenuOptions {
  /** The key the table is read with: the observer key, or the operator key on a machine without one. */
  readKey: string;
  /** The operator key, which every write runs on: asked for at the first write. */
  writeKey: () => Promise<string>;
  /** The key that mints a managed key, which writes IAM, with its organization: asked for when a mint is confirmed. */
  identityKey: () => Promise<{ secretKey: string; organizationId: string }>;
  projectId: string;
  region: string;
  /** App slug that names the `<slug>-<mode>-<suffix>` IAM app when minting a managed key. */
  slug: string;
  /** Deploy mode: per-mode IAM naming of a minted key. */
  mode: string;
  /** False under `--defaults` or without a TTY: the table is printed and nothing is picked. */
  pick: boolean;
  /** A line printed above the table, read while the table is: a deploy waiting for a value. */
  notice?: Promise<string | undefined>;
  /** The last rotation of the values infra makes, read while the table is, as {@link lastSecretsRotation} gives it. */
  rotation?: Promise<string | null | undefined>;
  /** Rotate secrets, which the row of the values infra makes opens: true when it rotated. */
  rotate: () => Promise<boolean>;
  prompts: SecretsPrompts;
  log?: (message: string) => void;
}

/** Everything the per-action handlers need; `writer` is the client on the operator key, made at the first write. */
interface MenuContext extends SecretsMenuOptions {
  writer: () => Promise<SecretManagerClient>;
  log: (message: string) => void;
  /** Values written or deleted so far, counted at each write: a pick Esc ends half-way keeps the writes it made. */
  writes: number;
}

const INFRA = 'made-by-infra';
const SET_ALL = 'set-all';

const takesEffect = 'New values reach the machines at the next deploy.';

/** Pulumi owns a container: one made here would make the next `pulumi up` fail with "secret already exists". */
export function applyFirst(log: (message: string) => void, secret: RuntimeSecretDefinition, then: string): void {
  log(`${warningMark} ${secret.envVar} has no secret in Secret Manager yet. Apply first (${pointTo('apply')}), which creates it, then ${then}.`);
}

/** A machine's env file is line-based and the deploy checks presence only: the form is checked here, where the value is written. */
function checkValue(input: string): true | string {
  const verdict = isEnvFileDeliverable(input.trim());
  if (verdict.ok) return true;
  return verdict.reason === 'empty' ? 'Value is required' : 'One line only: base64-encode a multi-line value and decode it in the service';
}

async function write(ctx: MenuContext, secret: RuntimeSecretDefinition, container: SecretManagerSecret, value: string): Promise<void> {
  await setValue(await ctx.writer(), container, value);
  ctx.writes += 1;
  ctx.log(`${checkMark} Updated ${secret.envVar}`);
}

/** Esc at a prompt of a pick steps back to the list it was opened from. */
function stepBack(error: unknown): void {
  if (!(error instanceof PromptBack)) throw error;
}

async function handleDelete(ctx: MenuContext, secret: RuntimeSecretDefinition, container: SecretManagerSecret | undefined): Promise<void> {
  if (!container) {
    ctx.log(`${tildeMark} ${secret.envVar} has no secret in Secret Manager.`);
    return;
  }
  const confirmed = await ctx.prompts.confirm({
    message: `${warningMark} Delete ${secret.envVar} with every version? ${secret.services.join(', ')} go without it from the next deploy.`,
    default: false,
  });
  if (!confirmed) {
    ctx.log(`${tildeMark} Deletion cancelled.`);
    return;
  }
  await (await ctx.writer()).deleteSecret(container.id);
  ctx.writes += 1;
  ctx.log(`${checkMark} Deleted ${secret.envVar}`);
}

async function handleSet(ctx: MenuContext, secret: RuntimeSecretDefinition, container: SecretManagerSecret | undefined): Promise<void> {
  if (!container) return applyFirst(ctx.log, secret, 'set it here');
  // Trimmed, so whitespace a paste brings never becomes part of the stored value.
  const value = (await ctx.prompts.password({ message: `New value for ${secret.envVar}`, validate: checkValue })).trim();
  await write(ctx, secret, container, value);
}

/** Ask each value in turn and set the ones answered: an empty answer leaves its value as it is. */
async function handleSetAll(ctx: MenuContext, definitions: readonly RuntimeSecretDefinition[], containers: ReadonlyMap<string, RuntimeContainer>) {
  for (const [index, secret] of definitions.entries()) {
    const container = containers.get(secret.secretName);
    if (!container) {
      applyFirst(ctx.log, secret, 'set it here');
      continue;
    }
    const value = (
      await ctx.prompts.password({
        message: `New value for ${secret.envVar} (${index + 1} of ${definitions.length}, empty skips)`,
        validate: (input) => input.trim() === '' || checkValue(input),
      })
    ).trim();
    if (value) await write(ctx, secret, container, value);
  }
}

/**
 * Mint (or rotate) a managed key: a scoped Scaleway IAM key cella creates and
 * writes into its runtime secrets without requiring an operator-created key.
 * Needs an IAMManager-capable caller key. The heavy lifting (verify containers
 * exist → mint → write versions) lives in `provision-managed-key.ts`.
 */
async function handleMint(ctx: MenuContext, key: ManagedKeyDefinition): Promise<void> {
  const confirmed = await ctx.prompts.confirm({
    message: `${warningMark} Mint a new key for ${key.label}? It takes your Owner key.`,
    default: false,
  });
  if (!confirmed) {
    ctx.log(`${tildeMark} Mint cancelled.`);
    return;
  }
  try {
    const identity = await ctx.identityKey();
    await provisionManagedKey({
      definition: key,
      callerSecretKey: identity.secretKey,
      organizationId: identity.organizationId,
      projectId: ctx.projectId,
      region: ctx.region,
      slug: ctx.slug,
      mode: ctx.mode,
      log: ctx.log,
    });
    ctx.writes += 1;
    ctx.log(`${checkMark} Minted ${key.label}`);
  } catch (error) {
    // Esc or Ctrl-C at the Owner key prompt leaves the mint as at any other prompt.
    if (error instanceof PromptBack || error instanceof ActionEnded || isPromptAbort(error)) throw error;
    ctx.log(`${warningMark} Mint failed: ${errorMessage(error)}`);
  }
}

type ValueAction = 'set' | 'delete' | 'mint' | typeof BACK;

/** The pick one value opens: set it, delete it, or mint the managed key written into it. */
async function handleValue(ctx: MenuContext, secret: RuntimeSecretDefinition, container: SecretManagerSecret | undefined): Promise<void> {
  const mintKey = managedKeys.find((key) => Object.values(key.assign).includes(secret.id));
  const actions: Array<MenuChoice<ValueAction>> = [
    { name: 'Set a new value', value: 'set', description: "Write a new version: the next deploy's machines get it." },
    { name: 'Delete', value: 'delete', description: 'Delete the secret with every version, after a confirmation.' },
    ...(mintKey
      ? [
          {
            name: 'Mint key',
            value: 'mint' as const,
            description: `Mint a scoped Scaleway key (${ctx.slug}-${mintKey.suffix}) and write it here: it takes an Owner API key.`,
          },
        ]
      : []),
  ];
  const action = await ctx.prompts.select<ValueAction>({
    message: secret.envVar,
    items: [...actions, RULE, { name: '← Back', value: BACK, description: 'Return to the list.' }],
  });
  if (action === 'set') return handleSet(ctx, secret, container);
  if (action === 'delete') return handleDelete(ctx, secret, container);
  if (action === 'mint' && mintKey) return handleMint(ctx, mintKey);
}

/** The pick a row of several values opens: each value with its own pick, and one entry that asks them all; it closes after a write. */
async function handleGroup(ctx: MenuContext, row: SecretRow, containers: ReadonlyMap<string, RuntimeContainer>): Promise<void> {
  const lines = formatSecretsTable(row.definitions.map((definition) => secretRow(definition.envVar, [definition], containers)));
  const names = row.definitions.map((definition) => definition.envVar);
  let picked: string | undefined;
  while (true) {
    const choice = await ctx.prompts.select<string>({
      message: row.label,
      items: [
        ...row.definitions.map((definition, index) => ({
          name: lines[index] ?? definition.envVar,
          value: definition.id,
          description: definition.description,
        })),
        RULE,
        {
          name: names.length === 2 ? 'Set both' : `Set all ${names.length}`,
          value: SET_ALL,
          description: `Asks ${names.slice(0, -1).join(', ')}, then ${names.at(-1)}.`,
        },
        { name: '← Back', value: BACK, description: 'Return to the table.' },
      ],
      default: picked,
    });
    if (choice === ESCAPED || choice === BACK) return;
    if (choice === SET_ALL) return handleSetAll(ctx, row.definitions, containers);
    picked = choice;
    const secret = row.definitions.find((definition) => definition.id === choice);
    if (!secret) throw new Error(`secrets: prompt returned unknown secret id '${choice}'`);
    const before = ctx.writes;
    await handleValue(ctx, secret, containers.get(secret.secretName)).catch(stepBack);
    if (ctx.writes !== before) return;
  }
}

/** The line under the table for a row: what its one value is for, or the env vars of its group. */
function rowDescription(row: SecretRow): string {
  const [only, ...others] = row.definitions;
  if (!only || others.length > 0) return row.definitions.map((definition) => definition.envVar).join(', ');
  return only.envVar === row.label ? only.description : `${only.envVar}: ${only.description}`;
}

/**
 * The operator values of one environment as one table, a row per group, read with `readKey`; a picked row opens its values, and the first
 * write asks for the operator key. The values infra makes are one row, which opens Rotate secrets and shows when it last ran. Esc or the
 * last row ends the table, as does a rotation.
 * @returns Whether a value changed, and whether the secrets were rotated.
 */
export async function secretsMenu(options: SecretsMenuOptions): Promise<{ changed: boolean; rotated: boolean }> {
  const scope = { region: options.region, projectId: options.projectId };
  const reader = createSecretManagerClient({ secretKey: options.readKey, ...scope });
  let writer: SecretManagerClient | undefined;
  const ctx: MenuContext = {
    ...options,
    writer: async () => {
      writer ??= createSecretManagerClient({ secretKey: await options.writeKey(), ...scope });
      return writer;
    },
    log: options.log ?? ((message) => console.info(message)),
    writes: 0,
  };

  const [read, notice, rotation] = await Promise.all([readContainers(reader), options.notice, options.rotation]);
  ctx.log(pc.bold(actionLabel('env')));
  ctx.log(pc.dim(takesEffect));
  ctx.log('');
  if (notice) ctx.log(`${notice}\n`);
  const infraLabel = `Made by infra (${runtimeSecrets.filter((definition) => definition.valueSource !== 'operator').length})`;
  const note = rotation === null ? 'never rotated' : rotation && `rotated ${rotation}`;
  let containers = read;
  let picked: string | undefined;
  while (true) {
    const rows = secretsTable(runtimeSecrets, containers);
    if (!options.pick) {
      for (const line of formatSecretsTable(rows, { label: infraLabel, note })) ctx.log(line);
      return { changed: false, rotated: false };
    }
    const lines = formatSecretsTable(rows, { label: `${infraLabel} ›`, note });
    const leave = leaveRow();
    const choice = await options.prompts.select<string>({
      message: '',
      items: [
        ...rows.map((row, index) => ({ name: lines[index] ?? row.label, value: row.label, description: rowDescription(row) })),
        RULE,
        {
          name: lines.at(-1) ?? infraLabel,
          value: INFRA,
          description: 'Database passwords and generated keys. Enter lists them and rotates them all.',
        },
        RULE,
        { name: leave.label, value: BACK, description: leave.description },
      ],
      default: picked,
    });
    if (choice === ESCAPED || choice === BACK) return { changed: ctx.writes > 0, rotated: false };
    picked = choice;
    if (choice === INFRA) {
      const rotated = await options.rotate().catch((error: unknown) => {
        stepBack(error);
        return false;
      });
      if (rotated) return { changed: ctx.writes > 0, rotated };
      continue;
    }
    const row = rows.find((candidate) => candidate.label === choice);
    if (!row) throw new Error(`secrets: prompt returned unknown row '${choice}'`);
    const before = ctx.writes;
    const [only, ...others] = row.definitions;
    const opened = only && others.length === 0 ? handleValue(ctx, only, containers.get(only.secretName)) : handleGroup(ctx, row, containers);
    await opened.catch(stepBack);
    if (ctx.writes !== before) containers = await readContainers(reader);
  }
}

/** The newest deploy when it ended blocked on values no secret holds, read on the observer key: its target and those env vars. */
async function blockedOnValues(context: InfraContext, observer: KeyPair): Promise<{ target: string; values: string[] } | undefined> {
  const key = stateKeyOf(observer, context.projectId);
  const s3 = await makeS3Client(context.appConfig.s3.region, key.accessKey, key.secretKey);
  const store = bucketRunStore(s3, deriveInfra(context.appConfig).naming.bootDiagBucket);
  const [run] = await store.listRuns(1);
  const record = run ? (await store.readRecord(run))?.newest : undefined;
  const values = record?.outcome === 'blocked' ? blockedValues(record.error) : [];
  return record && values.length > 0 ? { target: record.target, values } : undefined;
}

/**
 * Record a change of operator values as a rotation, under the lease. A machine keeps the env file of its first boot, and a deploy replaces
 * only machines booted under another commit, retry counter or rotation: the raised counter makes the next one replace them all.
 */
async function recordValuesChange(context: InfraContext, operator: OperatorKey): Promise<void> {
  const { appConfig } = context;
  const stack = stackNameFor(context);
  const state = stateKeyOf(operator, context.projectId);
  const lock = await acquireStackLockOrExit({ appConfig, ...state, stack, operation: 'record-values' });
  try {
    const s3 = await makeControlClient(appConfig.s3.region, state.accessKey, state.secretKey);
    const rotations = await recordRotation({ s3, bucket: deriveInfra(appConfig).naming.bootDiagBucket, stack, kind: 'values', by: controlActor() });
    console.info(pc.dim(`\nRotation ${rotations.counter} recorded: the next deploy replaces every machine.`));
  } finally {
    await lock.release();
  }
}

/** Run a deploy that ended blocked, on a missing secret among others, once more: true when it started. */
async function restartBlocked(context: InfraContext, operator: OperatorKey): Promise<boolean> {
  return startBlockedTarget(context, operator).catch((error) => {
    console.warn(`${warningMark} Could not start the blocked deploy again (${errorMessage(error)}): ${pointTo('deploy')} does.`);
    return false;
  });
}

/**
 * After a write: the change is recorded as a rotation, then a blocked deploy is started again, or the live release is offered a deploy on
 * new machines. A mint wrote on the Owner key alone, and the record asks for the operator key. Without a change, a blocked deploy is looked
 * for only when the operator key is in hand.
 */
export async function offerDeploy(context: InfraContext, operator: OperatorKey | undefined, changed: boolean): Promise<void> {
  if (!changed) {
    if (operator) await restartBlocked(context, operator);
    return;
  }
  const key = operator ?? (await acquireOperatorKey(context));
  await recordValuesChange(context, key);
  if (await restartBlocked(context, key)) return;
  console.info('The running machines keep the values they booted with until a deploy replaces them.');
  if (!(await confirmOrDefault({ message: 'Deploy the live release again, so the machines get the new values?', default: false }))) return;
  await redeployAfterRotation(context, key).catch((error) => {
    if (endsAction(error)) throw error;
    console.warn(`${warningMark} Could not start the deploy (${errorMessage(error)}): ${pointTo('deploy')} does.`);
  });
}

/**
 * This environment's operator values as one table, read with the observer key: a picked row sets or deletes its values, or mints a managed
 * key, and the row of the values infra makes rotates them. A deploy blocked on missing values is named above the table. A write takes the
 * operator key, asked for at the first one, or up front on a machine without an observer key. Minting a managed key writes IAM, which takes
 * an Owner API key, asked for when a mint is confirmed.
 */
export async function runSecrets(context: InfraContext): Promise<void> {
  const { appConfig, projectId } = context;
  let operator: OperatorKey | undefined;
  const operatorKey = async () => {
    operator ??= await acquireOperatorKey(context);
    return operator;
  };
  const observer = resolveOperatorIdentity().observer;
  const reader = observer ?? (await operatorKey());
  // The notice is a courtesy: a bucket that admits no version read by the observer yet leaves it out.
  const notice = observer
    ? blockedOnValues(context, observer).then(
        (blocked) => blocked && `A deploy of ${blocked.target.slice(0, 10)} waits for ${blocked.values.join(', ')}: setting them starts it again.`,
        () => undefined,
      )
    : undefined;
  let identityKey: OwnerKey | undefined;
  let outcome = { changed: false, rotated: false };
  const pick = Boolean(process.stdin.isTTY) && !autoAcceptDefaults();

  try {
    outcome = await secretsMenu({
      readKey: reader.secretKey,
      writeKey: async () => (await operatorKey()).secretKey,
      identityKey: async () => {
        identityKey ??= await acquireIdentityKey(context, 'Minting a managed key creates an application, a policy and a key.');
        return identityKey;
      },
      projectId,
      region: appConfig.s3.region,
      slug: appConfig.slug,
      mode: context.environment,
      pick,
      notice,
      rotation: lastSecretsRotation(context, reader),
      rotate: () => runRotateSecrets(context),
      prompts: { select: menuSelect, password: maskedSecret, confirm },
    });
  } finally {
    await identityKey?.release();
  }
  // A rotation ends on a redeploy of every machine, which carries the values set before it.
  if (outcome.rotated) return;
  // Esc on a table that took no key leaves the action: the menu comes back at once.
  if (pick && !outcome.changed && !operator && !identityKey) throw new PromptBack();
  if (identityKey) printRevokeReminder();
  await offerDeploy(context, operator, outcome.changed);
}
