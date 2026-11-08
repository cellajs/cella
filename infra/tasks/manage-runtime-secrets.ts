import { type ManagedKeyDefinition, managedKeys } from '../lib/managed-keys';
import { actionCommand } from '../lib/operator-actions';
import { protectsStoredData, type RuntimeSecretDefinition, runtimeSecrets } from '../lib/runtime-secrets';
import { createSecretManagerClient, type SecretManagerSecret } from '../lib/scaleway/scaleway-secret-manager';
import { RUNTIME_FOLDER } from '../lib/scaleway/secret-paths';
import { checkMark, crossMark, pc, tildeMark, warningMark } from '../lib/utils/cli-output';
import { isEnvFileDeliverable } from '../lib/utils/env-file';
import { isMain } from '../lib/utils/is-main';
import { ensureSecrets } from './ensure-secrets';
import { provisionManagedKey } from './provision-managed-key';

type PromptOption<T extends string> = { name: string; value: T; description?: string };
/** A choice, or a line of text between the choices. */
type PromptItem<T extends string> = PromptOption<T> | { group: string };

/**
 * Resolved by a selection prompt when the operator presses Esc to step back to
 * the previous menu without choosing an option. A symbol ensures it cannot
 * collide with a real (string) secret id or action value.
 */
export const BACK = Symbol('runtime-secret-menu-back');

export interface RuntimeSecretPrompts {
  select<T extends string>(options: { message: string; choices: Array<PromptItem<T>>; default?: T }): Promise<T | typeof BACK>;
  password(options: { message: string; validate?: (value: string) => true | string }): Promise<string>;
  confirm(options: { message: string; default?: boolean }): Promise<boolean>;
}

export interface ManageRuntimeSecretsOptions {
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
  prompts: RuntimeSecretPrompts;
  log?: (message: string) => void;
}

type SecretManagerClient = ReturnType<typeof createSecretManagerClient>;

const defaultLog = (message: string) => console.info(message);

/** A row of the table: the name the app reads, the services that read it, and what Secret Manager holds for it. */
export interface SecretRow {
  envVar: string;
  usedBy: string;
  state: string;
  kind: 'missing' | 'empty' | 'set' | 'infra';
  definition: RuntimeSecretDefinition;
}

const kindOrder: SecretRow['kind'][] = ['missing', 'set', 'empty', 'infra'];
const kindMarks: Record<SecretRow['kind'], string> = { missing: crossMark, empty: pc.dim('○'), set: pc.green('●'), infra: pc.dim('◇') };

const takesEffect = "A value is written at once; running machines keep what they booted with, the next deploy's machines get the new one.";

/** `Nov 8` in the local time zone, or nothing when Secret Manager gave no date. */
function shortDate(iso: string | undefined): string {
  const date = iso ? new Date(iso) : undefined;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
}

/**
 * One row per runtime secret: required values without a version first, then optional ones without, then the ones set, then the ones infra
 * makes, in registry order within each. `containers` are the runtime folder's secrets by name.
 */
export function secretsTable(
  definitions: readonly RuntimeSecretDefinition[],
  containers: ReadonlyMap<string, { version_count?: number; setAt?: string }>,
): SecretRow[] {
  const rows = definitions.map((definition): SecretRow => {
    const row = { envVar: definition.envVar, usedBy: definition.services.join(', '), definition };
    if (definition.valueSource !== 'operator') {
      return { ...row, kind: 'infra', state: protectsStoredData(definition) ? 'made by infra · kept' : 'made by infra' };
    }
    const container = containers.get(definition.secretName);
    if (container && (container.version_count ?? 0) > 0) return { ...row, kind: 'set', state: `set ${shortDate(container.setAt)}`.trimEnd() };
    return definition.required ? { ...row, kind: 'missing', state: 'missing · required' } : { ...row, kind: 'empty', state: 'empty · optional' };
  });
  return rows.sort((a, b) => kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind));
}

/** The column header and a line formatter whose columns align across `rows`. */
function tableColumns(rows: readonly SecretRow[]): { header: string; line: (row: SecretRow) => string } {
  const header = { envVar: 'NAME', usedBy: 'USED BY', state: 'STATE' };
  const nameWidth = Math.max(...[header, ...rows].map((row) => row.envVar.length));
  const usedByWidth = Math.max(...[header, ...rows].map((row) => row.usedBy.length));
  const text = (row: Pick<SecretRow, 'envVar' | 'usedBy' | 'state'>) =>
    `${row.envVar.padEnd(nameWidth)}  ${row.usedBy.padEnd(usedByWidth)}  ${row.state}`;
  return {
    header: pc.dim(`  ${text(header)}`),
    line: (row) => `${kindMarks[row.kind]} ${row.kind === 'infra' ? pc.dim(text(row)) : text(row)}`,
  };
}

/** The header, then one line per row: a mark per state, and the rows infra makes dimmed. */
export function formatSecretsTable(rows: readonly SecretRow[]): string[] {
  const { header, line } = tableColumns(rows);
  return [header, ...rows.map(line)];
}

/** Everything the per-action handlers need. */
interface MenuContext {
  /** The client on the operator key, made at the first write. */
  writer: () => Promise<SecretManagerClient>;
  prompts: RuntimeSecretPrompts;
  identityKey: () => Promise<{ secretKey: string; organizationId: string }>;
  projectId: string;
  region: string;
  slug: string;
  mode: string;
  log: (message: string) => void;
}

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
  // A value derived from this one is made anew with it: the Yjs relay's public key refuses every token a new private key signs.
  const rotated = [secret, ...runtimeSecrets.filter((candidate) => candidate.derivedFrom?.secretId === secret.id)];
  const written = new Set(await ensureSecrets({ client: await ctx.writer(), secrets: rotated, rotate: true, log: () => {} }));
  const names = rotated.filter((definition) => written.has(definition.secretName)).map((definition) => definition.envVar);
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
  const version = await client.putSecretValue({
    secretId: container.id,
    value,
    description: 'Updated by the infra CLI (Env vars & secrets)',
    disablePrevious: true,
  });
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
    ctx.log(`${warningMark} Mint failed: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

type RowAction = 'set' | 'delete' | 'rotate' | 'mint' | 'back';

/** The short pick a row opens; returns whether a value changed. */
async function handleRow(ctx: MenuContext, secret: RuntimeSecretDefinition, container: SecretManagerSecret | undefined): Promise<boolean> {
  const mintKey = managedKeys.find((key) => Object.values(key.assign).includes(secret.id));
  const actions: Array<PromptOption<RowAction>> = [
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
    choices: [...actions, { name: '← Back', value: 'back', description: 'Return to the table.' }],
  });
  if (action === 'set') return handleSet(ctx, secret, container);
  if (action === 'delete') return handleDelete(ctx, secret, container);
  if (action === 'rotate') return handleRotate(ctx, secret, container);
  if (action === 'mint' && mintKey) return handleMint(ctx, mintKey);
  return false;
}

/**
 * The env vars and secrets of one environment as one table, read with `readKey`; a picked row opens its actions, and the first write asks
 * for the operator key. Esc on the table ends it.
 * @returns Whether a value changed.
 */
export async function manageRuntimeSecrets(options: ManageRuntimeSecretsOptions): Promise<{ changed: boolean }> {
  const scope = { region: options.region, projectId: options.projectId };
  const reader = createSecretManagerClient({ secretKey: options.readKey, ...scope });
  let writer: SecretManagerClient | undefined;
  const ctx: MenuContext = {
    writer: async () => {
      writer ??= createSecretManagerClient({ secretKey: await options.writeKey(), ...scope });
      return writer;
    },
    prompts: options.prompts,
    identityKey: options.identityKey,
    projectId: options.projectId,
    region: options.region,
    slug: options.slug,
    mode: options.mode,
    log: options.log ?? defaultLog,
  };
  // The secret's own `updated_at` moves with its container (a move, a description), so the date a value was set is its newest version's.
  const readContainers = async () => {
    const secrets = await reader.listSecretsUnder(RUNTIME_FOLDER);
    const setAt = await Promise.all(
      secrets.map(async (secret) => {
        if ((secret.version_count ?? 0) === 0) return undefined;
        const [newest] = await reader.listSecretVersions(secret.id).catch(() => []);
        return newest?.created_at ?? undefined;
      }),
    );
    return new Map(secrets.map((secret, index) => [secret.name, { ...secret, setAt: setAt[index] }]));
  };

  let containers = await readContainers();
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
      choices: [
        { group: header },
        ...rows.map((row) => ({ name: line(row), value: row.definition.id, description: row.definition.description })),
        { group: '' },
        { group: takesEffect },
      ],
      default: picked,
    });
    if (choice === BACK) return { changed };
    picked = choice;
    const row = rows.find((candidate) => candidate.definition.id === choice);
    if (!row) throw new Error(`manage-runtime-secrets: prompt returned unknown secret id '${choice}'`);
    if (await handleRow(ctx, row.definition, containers.get(row.definition.secretName))) {
      changed = true;
      containers = await readContainers();
    }
  }
}

if (isMain(import.meta.url)) {
  process.stderr.write('Run this task through the infra CLI (Env vars & secrets) so prompts and stack context stay aligned.\n');
  process.exit(1);
}
