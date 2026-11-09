import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { confirm, input } from '@inquirer/prompts';
import { blockedValues } from '../../lib/deploy/failure-class';
import { bucketRunStore } from '../../lib/deploy/run-store';
import { type ManagedKeyDefinition, managedKeys } from '../../lib/managed-keys';
import { deriveInfra } from '../../lib/naming';
import { actionCommand } from '../../lib/operator-actions';
import { protectsStoredData, type RuntimeSecretDefinition, runtimeSecrets } from '../../lib/runtime-secrets';
import { type KeyPair, resolveOperatorIdentity } from '../../lib/scaleway/operator-identity';
import { makeS3Client, stateKeyOf } from '../../lib/scaleway/s3-client';
import { createSecretManagerClient, type SecretManagerSecret } from '../../lib/scaleway/scaleway-secret-manager';
import { checkMark, pc, tildeMark, warningMark } from '../../lib/utils/cli-output';
import { isEnvFileDeliverable } from '../../lib/utils/env-file';
import { parseEnvText, rootEnvFile } from '../../lib/utils/env-files';
import { errorMessage } from '../../lib/utils/errors';
import {
  formatEnvImport,
  formatSecretsTable,
  planEnvImport,
  type RuntimeContainer,
  readContainers,
  rotateSecret,
  type SecretManagerClient,
  secretsTable,
  setValue,
  tableColumns,
} from '../../tasks/manage-runtime-secrets';
import { provisionManagedKey } from '../../tasks/provision-managed-key';
import type { MenuChoice } from '../menu';
import { maskedSecret } from '../prompts/masked-secret';
import { ESCAPED, type MenuSelectOptions, menuSelect } from '../prompts/menu-select';
import { autoAcceptDefaults, confirmOrDefault, type InfraContext } from '../shared';
import { acquireIdentityKey, acquireOperatorKey, type OperatorKey } from './operator-unlock';
import { type OwnerKey, printRevokeReminder } from './owner-key';
import { runStartDeploy, startBlockedTarget } from './start-deploy';

/** The prompts of the pick: Esc in a select steps back and resolves to {@link ESCAPED}. */
export interface SecretsPrompts {
  select<T extends string>(options: MenuSelectOptions<T>): Promise<T | typeof ESCAPED>;
  password(options: { message: string; validate?: (value: string) => true | string }): Promise<string>;
  confirm(options: { message: string; default?: boolean }): Promise<boolean>;
  input(options: { message: string; default?: string }): Promise<string>;
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
  prompts: SecretsPrompts;
  log?: (message: string) => void;
}

/** Everything the per-action handlers need; `writer` is the client on the operator key, made at the first write. */
interface MenuContext extends SecretsMenuOptions {
  writer: () => Promise<SecretManagerClient>;
  log: (message: string) => void;
}

const IMPORT = 'import-env-file';

const takesEffect = "A value is written at once; running machines keep what they booted with, the next deploy's machines get the new one.";

/** Pulumi owns a container: one made here would make the next `pulumi up` fail with "secret already exists". */
function applyFirst(ctx: MenuContext, secret: RuntimeSecretDefinition, then: string): false {
  ctx.log(
    `${warningMark} ${secret.envVar} has no secret in Secret Manager yet. Apply first (\`${actionCommand('apply')}\`), which creates it, then ${then} here.`,
  );
  return false;
}

async function handleRotate(ctx: MenuContext, secret: RuntimeSecretDefinition, container: SecretManagerSecret | undefined): Promise<boolean> {
  if (!container) return applyFirst(ctx, secret, 'rotate it');
  const confirmed = await ctx.prompts.confirm({
    message: `${warningMark} Rotate ${secret.envVar}? The machines of the next deploy get a fresh random value.`,
    default: false,
  });
  if (!confirmed) {
    ctx.log(`${tildeMark} Rotation cancelled.`);
    return false;
  }
  const names = await rotateSecret(await ctx.writer(), secret);
  if (names.length === 0) return applyFirst(ctx, secret, 'rotate it');
  ctx.log(`${checkMark} Rotated ${names.join(', ')}`);
  return true;
}

async function handleDelete(ctx: MenuContext, secret: RuntimeSecretDefinition, container: SecretManagerSecret | undefined): Promise<boolean> {
  if (!container) {
    ctx.log(`${tildeMark} ${secret.envVar} has no secret in Secret Manager.`);
    return false;
  }
  const confirmed = await ctx.prompts.confirm({
    message: `${warningMark} Delete ${secret.envVar} with every version? ${secret.services.join(', ')} go without it from the next deploy.`,
    default: false,
  });
  if (!confirmed) {
    ctx.log(`${tildeMark} Deletion cancelled.`);
    return false;
  }
  await (await ctx.writer()).deleteSecret(container.id);
  ctx.log(`${checkMark} Deleted ${secret.envVar}`);
  return true;
}

async function handleSet(ctx: MenuContext, secret: RuntimeSecretDefinition, container: SecretManagerSecret | undefined): Promise<boolean> {
  if (!container) return applyFirst(ctx, secret, 'set it');
  const client = await ctx.writer();

  // Trim so accidental leading/trailing whitespace (e.g. from a paste) never
  // becomes part of the stored secret; validate on the trimmed length so an
  // all-whitespace entry is rejected the same as an empty one.
  const value = (
    await ctx.prompts.password({
      message: `New value for ${secret.envVar}`,
      // A machine's env file is line-based, and the deploy checks presence only: the form is checked here, where the value is written.
      validate: (input) => {
        const verdict = isEnvFileDeliverable(input.trim());
        if (verdict.ok) return true;
        return verdict.reason === 'empty' ? 'Value is required' : 'One line only: base64-encode a multi-line value and decode it in the service';
      },
    })
  ).trim();
  const version = await setValue(client, container, value);
  ctx.log(`${checkMark} Updated ${secret.envVar} ${pc.dim(`(revision ${version.revision}, ${value.length} chars)`)}`);
  return true;
}

/**
 * Mint (or rotate) a managed key: a scoped Scaleway IAM key cella creates and
 * writes into its runtime secrets without requiring an operator-created key.
 * Needs an IAMManager-capable caller key. The heavy lifting (verify containers
 * exist → mint → write versions) lives in `provision-managed-key.ts`.
 */
async function handleMint(ctx: MenuContext, key: ManagedKeyDefinition): Promise<boolean> {
  const confirmed = await ctx.prompts.confirm({
    message: `${warningMark} Mint a fresh scoped Scaleway key for ${key.label}? Supersedes any current value on the next deploy; it writes IAM, so it takes an Owner API key.`,
    default: false,
  });
  if (!confirmed) {
    ctx.log(`${tildeMark} Mint cancelled.`);
    return false;
  }
  try {
    const identity = await ctx.identityKey();
    const result = await provisionManagedKey({
      definition: key,
      callerSecretKey: identity.secretKey,
      organizationId: identity.organizationId,
      projectId: ctx.projectId,
      region: ctx.region,
      slug: ctx.slug,
      mode: ctx.mode,
      log: ctx.log,
    });
    ctx.log(`${checkMark} Minted ${key.label} ${pc.dim(`(app ${result.applicationId})`)}`);
    return true;
  } catch (error) {
    ctx.log(`${warningMark} Mint failed: ${errorMessage(error)}`);
    return false;
  }
}

type RowAction = 'set' | 'delete' | 'rotate' | 'mint' | 'back';

/** The short pick a row opens; returns whether a value changed. */
async function handleRow(ctx: MenuContext, secret: RuntimeSecretDefinition, container: SecretManagerSecret | undefined): Promise<boolean> {
  const mintKey = managedKeys.find((key) => Object.values(key.assign).includes(secret.id));
  const actions: Array<MenuChoice<RowAction>> = [
    ...(secret.valueSource === 'operator'
      ? [
          { name: 'Set a new value', value: 'set' as const, description: "Write a new version: the next deploy's machines get it." },
          { name: 'Delete', value: 'delete' as const, description: 'Delete the secret with every version, after a confirmation.' },
        ]
      : []),
    ...(secret.valueSource !== 'operator' && secret.rotatable
      ? [{ name: 'Rotate', value: 'rotate' as const, description: "A fresh random value: the next deploy's machines get it." }]
      : []),
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
  if (actions.length === 0) {
    ctx.log(
      pc.dim(
        protectsStoredData(secret)
          ? `${secret.envVar} protects stored data: no rotation replaces it, and a teardown keeps it.`
          : `${secret.envVar} is made by infra: nothing to set here.`,
      ),
    );
    return false;
  }
  const action = await ctx.prompts.select<RowAction>({
    message: secret.envVar,
    items: [...actions, { name: '← Back', value: 'back', description: 'Return to the table.' }],
    escape: 'back',
  });
  if (action === 'set') return handleSet(ctx, secret, container);
  if (action === 'delete') return handleDelete(ctx, secret, container);
  if (action === 'rotate') return handleRotate(ctx, secret, container);
  if (action === 'mint' && mintKey) return handleMint(ctx, mintKey);
  return false;
}

/** Set each operator value a `.env` file holds, after one confirmation; returns whether a value changed. */
async function handleImport(ctx: MenuContext, containers: ReadonlyMap<string, RuntimeContainer>): Promise<boolean> {
  const path = await ctx.prompts.input({ message: 'Path of the .env file', default: relative(process.cwd(), rootEnvFile()) });
  let text: string;
  try {
    text = readFileSync(resolve(path), 'utf8');
  } catch (error) {
    ctx.log(`${warningMark} ${path} could not be read: ${errorMessage(error)}`);
    return false;
  }
  const lines = planEnvImport(parseEnvText(text), runtimeSecrets);
  for (const line of formatEnvImport(lines)) ctx.log(line);
  const writes = lines.flatMap((line) => (line.write ? [line.write] : []));
  if (writes.length === 0) {
    ctx.log(`${tildeMark} ${path} holds no value to set here.`);
    return false;
  }
  if (!(await ctx.prompts.confirm({ message: `Set ${writes.length} value${writes.length === 1 ? '' : 's'} from ${path}?`, default: false }))) {
    ctx.log(`${tildeMark} Import cancelled.`);
    return false;
  }
  let written = 0;
  for (const { definition, value } of writes) {
    const container = containers.get(definition.secretName);
    if (!container) {
      applyFirst(ctx, definition, 'import it');
      continue;
    }
    await setValue(await ctx.writer(), container, value);
    written += 1;
  }
  ctx.log(`${written > 0 ? checkMark : tildeMark} Set ${written} of ${writes.length} values from ${path}`);
  return written > 0;
}

/**
 * The env vars and secrets of one environment as one table, read with `readKey`; a picked row opens its actions, the last entry imports a
 * `.env` file, and the first write asks for the operator key. Esc on the table ends it.
 * @returns Whether a value changed.
 */
export async function secretsMenu(options: SecretsMenuOptions): Promise<{ changed: boolean }> {
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
  };

  const [read, notice] = await Promise.all([readContainers(reader), options.notice]);
  if (notice) ctx.log(notice);
  let containers = read;
  let changed = false;
  let picked: string | undefined;
  while (true) {
    const rows = secretsTable(runtimeSecrets, containers);
    if (!options.pick) {
      for (const line of [...formatSecretsTable(rows), '', pc.dim(takesEffect)]) ctx.log(line);
      return { changed };
    }
    const { header, line } = tableColumns(rows);
    const choice = await options.prompts.select<string>({
      message: `Env vars & secrets ${pc.dim(options.mode)}`,
      items: [
        { group: header },
        ...rows.map((row) => ({ name: line(row), value: row.definition.id, description: row.definition.description })),
        { group: '' },
        { group: takesEffect },
        { group: '' },
        { name: 'Import a .env file', value: IMPORT, description: 'Set every value a .env file holds for an env var above, after one confirmation.' },
      ],
      default: picked,
      escape: 'back',
    });
    if (choice === ESCAPED) return { changed };
    picked = choice;
    const row = rows.find((candidate) => candidate.definition.id === choice);
    if (choice !== IMPORT && !row) throw new Error(`secrets: prompt returned unknown secret id '${choice}'`);
    const wrote = row ? await handleRow(ctx, row.definition, containers.get(row.definition.secretName)) : await handleImport(ctx, containers);
    if (wrote) {
      changed = true;
      containers = await readContainers(reader);
    }
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
 * This environment's env vars and secrets as one table, read with the observer key; a picked row is set, rotated, deleted or minted, and a
 * `.env` file sets several at once. A deploy blocked on missing values is named above the table. A write takes the operator key, asked for
 * at the first one, or up front on a machine without an observer key. Minting a managed key writes IAM, which takes an Owner API key, asked
 * for when a mint is confirmed. A deploy that ended blocked, on a missing secret among others, is started again at the end; else a changed
 * value is offered a deploy.
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
  let changed = false;

  try {
    ({ changed } = await secretsMenu({
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
      pick: Boolean(process.stdin.isTTY) && !autoAcceptDefaults(),
      notice,
      prompts: { select: menuSelect, password: maskedSecret, confirm, input },
    }));
  } finally {
    await identityKey?.release();
  }
  if (identityKey) printRevokeReminder();
  const restarted = operator
    ? await startBlockedTarget(context, operator).catch((error) => {
        console.warn(`${warningMark} Could not start the blocked deploy again (${errorMessage(error)}): \`${actionCommand('start-deploy')}\` does.`);
        return false;
      })
    : false;
  if (!changed || restarted) return;
  console.info('\nA new value reaches the machines at the next deploy.');
  if (await confirmOrDefault({ message: 'Deploy now, so the machines get it?', default: false })) await runStartDeploy(context);
}
