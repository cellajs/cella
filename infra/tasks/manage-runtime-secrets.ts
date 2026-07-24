import { randomBytes } from 'node:crypto'
import { isMain } from '../lib/utils/is-main'
import { managedKeys } from '../lib/managed-keys'
import { runtimeSecrets, type RuntimeSecretDefinition } from '../lib/runtime-secrets'
import { createSecretManagerClient } from '../lib/scaleway/scaleway-secret-manager'
import { provisionManagedKey } from './provision-managed-key'
import { pc, checkMark, tildeMark, warningMark } from '../lib/utils/cli-output'

type PromptOption<T extends string> = { name: string; value: T; description?: string }

/**
 * Resolved by a selection prompt when the operator presses Esc to step back to
 * the previous menu without choosing an option. A symbol ensures it cannot
 * collide with a real (string) secret id or action value.
 */
export const BACK = Symbol('runtime-secret-menu-back')

export interface RuntimeSecretPrompts {
  select<T extends string>(options: { message: string; choices: Array<PromptOption<T>> }): Promise<T | typeof BACK>
  password(options: { message: string; validate?: (value: string) => true | string }): Promise<string>
  confirm(options: { message: string; default?: boolean }): Promise<boolean>
}

export interface ManageRuntimeSecretsOptions {
  secretKey: string
  projectId: string
  region: string
  /** App slug that names the `<slug>-<suffix>` IAM app when minting a managed key. */
  slug: string
  path: string
  prompts: RuntimeSecretPrompts
  log?: (message: string) => void
}

type ManagedRuntimeSecret = RuntimeSecretDefinition
type Action = 'list' | 'set' | 'delete' | 'rotate' | 'mint' | 'exit'

const defaultLog = (message: string) => console.info(message)

function operatorManagedSecrets(): ManagedRuntimeSecret[] {
  return runtimeSecrets.filter((secret) => secret.valueSource === 'operator')
}

function formatSecretChoice(secret: ManagedRuntimeSecret): PromptOption<string> {
  return {
    name: `${secret.secretName} (${secret.envVar})`,
    value: secret.id,
    description: `${secret.services.join(', ')}${secret.required ? ' • required' : ' • optional'}`,
  }
}

export function generateRandomRuntimeSecret() {
  return randomBytes(32).toString('base64url')
}

/** Everything the per-action handlers need. */
interface MenuContext {
  client: ReturnType<typeof createSecretManagerClient>
  secrets: ManagedRuntimeSecret[]
  prompts: RuntimeSecretPrompts
  path: string
  /** IAM-capable caller key + identity, used by the mint action. */
  secretKey: string
  projectId: string
  region: string
  slug: string
  log: (message: string) => void
}

/** Selection prompt shared by rotate/set/delete; undefined = Esc (go back). */
async function selectSecret(ctx: MenuContext, message: string, choices: ManagedRuntimeSecret[]): Promise<ManagedRuntimeSecret | undefined> {
  const selectedId = await ctx.prompts.select<string>({ message, choices: choices.map(formatSecretChoice) })
  if (selectedId === BACK) return undefined
  const secret = choices.find((entry) => entry.id === selectedId)
  if (!secret) throw new Error(`manage-runtime-secrets: prompt returned unknown secret id '${selectedId}'`)
  return secret
}

async function handleList(ctx: MenuContext): Promise<void> {
  const existing = await ctx.client.listSecrets(ctx.path)
  const byName = new Map(existing.map((secret) => [secret.name, secret]))
  ctx.log(`\n${pc.bold('Runtime secrets')} ${pc.dim(ctx.path)}`)
  for (const secret of ctx.secrets) {
    const current = byName.get(secret.secretName)
      // Treat only versioned secrets as present; an empty container has no readable value.
      // Report that intermediate state so the operator knows to set it.
    const status = !current
      ? `${tildeMark} missing`
      : (current.version_count ?? 0) > 0
        ? `${checkMark} present`
        : `${warningMark} empty (no version — run "Set or update")`
    ctx.log(`- ${secret.secretName} (${secret.envVar}) — ${status}; consumers: ${secret.services.join(', ')}`)
  }
}

async function handleRotate(ctx: MenuContext): Promise<void> {
  const rotatable = ctx.secrets.filter((secret) => secret.generation === 'random')
  if (rotatable.length === 0) {
    ctx.log(`${tildeMark} No operator-managed runtime secrets support random rotation yet.`)
    return
  }
  const secret = await selectSecret(ctx, 'Select a runtime secret to rotate (Esc to go back)', rotatable)
  if (!secret) return
  // Pulumi owns container creation (resources/secrets.ts); refuse to create one
  // out-of-band here, since that would make the next `pulumi up` fail with
  // "secret already exists". Deploy first so the container exists, then rotate.
  const existing = await ctx.client.getSecretByName(secret.secretName, ctx.path)
  if (!existing) {
    ctx.log(`${warningMark} ${secret.secretName} (${secret.envVar}) has no container yet. Deploy first so Pulumi creates it, then rotate.`)
    return
  }
  const version = await ctx.client.putSecretValue({
    secretId: existing.id,
    value: generateRandomRuntimeSecret(),
    description: 'Rotated by bootstrap manage secrets',
    disablePrevious: true,
  })
  ctx.log(`${checkMark} Rotated ${secret.secretName} ${pc.dim(`(revision ${version.revision})`)}`)
}

async function handleDelete(ctx: MenuContext): Promise<void> {
  const secret = await selectSecret(ctx, 'Select a runtime secret to delete (Esc to go back)', ctx.secrets)
  if (!secret) return
  const existingSecret = await ctx.client.getSecretByName(secret.secretName, ctx.path)
  if (!existingSecret) {
    ctx.log(`${tildeMark} ${secret.secretName} does not exist in ${ctx.path}`)
    return
  }
  const confirmed = await ctx.prompts.confirm({
    message: `${warningMark} Delete secret object ${secret.secretName} (${secret.envVar}) for ${secret.services.join(', ')}?`,
    default: false,
  })
  if (!confirmed) {
    ctx.log(`${tildeMark} Deletion cancelled.`)
    return
  }
  await ctx.client.deleteSecret(existingSecret.id)
  ctx.log(`${checkMark} Deleted ${secret.secretName}`)
}

async function handleSet(ctx: MenuContext): Promise<void> {
  const secret = await selectSecret(ctx, 'Select a runtime secret to set (Esc to go back)', ctx.secrets)
  if (!secret) return
    // Refuse out-of-band container creation because Pulumi owns it and would hit a duplicate.
    // Operators must deploy the empty container before setting its value.
  const existingSecret = await ctx.client.getSecretByName(secret.secretName, ctx.path)
  if (!existingSecret) {
    ctx.log(
      `${warningMark} ${secret.secretName} (${secret.envVar}) has no container yet. ` +
        `Deploy first so Pulumi creates it, then run "Set or update" again to give it a value.`,
    )
    return
  }

  // Trim so accidental leading/trailing whitespace (e.g. from a paste) never
  // becomes part of the stored secret; validate on the trimmed length so an
  // all-whitespace entry is rejected the same as an empty one.
  const value = (
    await ctx.prompts.password({
      message: `New value for ${secret.secretName}`,
      validate: (input) => input.trim().length > 0 || 'Value is required',
    })
  ).trim()
  const version = await ctx.client.putSecretValue({
    secretId: existingSecret.id,
    value,
    description: 'Updated by bootstrap manage secrets',
    disablePrevious: true,
  })
  ctx.log(`${checkMark} Updated ${secret.secretName} ${pc.dim(`(revision ${version.revision}, ${value.length} chars)`)}`)
}

/**
 * Mint (or rotate) a managed key: a scoped Scaleway IAM key cella creates and
 * writes into its runtime secrets without requiring an operator-created key.
 * Needs an IAMManager-capable caller key. The heavy lifting (verify containers
 * exist → mint → write versions) lives in `provision-managed-key.ts`.
 */
async function handleMint(ctx: MenuContext): Promise<void> {
  if (managedKeys.length === 0) {
    ctx.log(`${tildeMark} No mintable managed keys are configured.`)
    return
  }
  const selectedId = await ctx.prompts.select<string>({
    message: 'Select a managed key to mint / rotate (Esc to go back)',
    choices: managedKeys.map((key) => {
      const targets = Object.values(key.assign).map((id) => runtimeSecrets.find((secret) => secret.id === id)?.envVar ?? id)
      return { name: `${key.suffix} — ${key.label}`, value: key.id, description: `${ctx.slug}-${key.suffix} → ${targets.join(', ')}` }
    }),
  })
  if (selectedId === BACK) return
  const key = managedKeys.find((entry) => entry.id === selectedId)
  if (!key) throw new Error(`manage-runtime-secrets: prompt returned unknown managed key id '${selectedId}'`)

  const confirmed = await ctx.prompts.confirm({
    message: `${warningMark} Mint a fresh scoped Scaleway key for ${key.label}? Supersedes any current value on the next deploy; needs an IAMManager-capable key.`,
    default: false,
  })
  if (!confirmed) {
    ctx.log(`${tildeMark} Mint cancelled.`)
    return
  }
  try {
    const result = await provisionManagedKey({
      definition: key,
      callerSecretKey: ctx.secretKey,
      projectId: ctx.projectId,
      region: ctx.region,
      slug: ctx.slug,
      path: ctx.path,
      log: ctx.log,
    })
    ctx.log(`${checkMark} Minted ${key.label} ${pc.dim(`(app ${result.applicationId})`)}`)
  } catch (error) {
    ctx.log(`${warningMark} Mint failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export async function manageRuntimeSecrets(options: ManageRuntimeSecretsOptions): Promise<void> {
  const ctx: MenuContext = {
    client: createSecretManagerClient({ secretKey: options.secretKey, region: options.region, projectId: options.projectId }),
    secrets: operatorManagedSecrets(),
    prompts: options.prompts,
    path: options.path,
    secretKey: options.secretKey,
    projectId: options.projectId,
    region: options.region,
    slug: options.slug,
    log: options.log ?? defaultLog,
  }

  // Secret Manager writes an immutable version immediately, but services load it only at boot.
  // The trailing newline separates this warning from the menu.
  ctx.log(
    `${pc.dim('Changes are written to Secret Manager immediately as a new version. Scaleway may keep the parent secret')}\n` +
      `${pc.dim('container metadata looking unchanged; check the secret\'s Versions list for the new revision. Running services pick')}\n` +
      `${pc.dim('up the latest value only on the next VM boot or deploy.')}\n`,
  )

  // Loop the menu so an operator setting up a fresh environment can manage
  // several secrets in one session.
  // Each handler returns here; "Exit" (or Esc) is the only way out.
  while (true) {
    const action = await options.prompts.select<Action>({
      message: 'Manage runtime secrets',
      choices: [
        { name: 'List', value: 'list', description: 'Show operator-managed runtime secrets and whether a secret object exists.' },
        { name: 'Set or update', value: 'set', description: 'Create a new secret version for a selected runtime secret.' },
        { name: 'Rotate', value: 'rotate', description: 'Generate a fresh random value for a selected runtime secret when supported.' },
        { name: 'Mint key', value: 'mint', description: 'Mint (or rotate) a scoped Scaleway IAM key and write it into its runtime secret(s).' },
        { name: 'Delete', value: 'delete', description: 'Delete an entire runtime secret object after confirmation.' },
        { name: 'Exit', value: 'exit', description: 'Leave the runtime secrets menu.' },
      ],
    })

    // Esc on the top menu behaves like "Exit"; there is no parent menu to return
    // to (the infra CLI exits once secrets management is done).
    if (action === BACK || action === 'exit') return
    if (action === 'list') await handleList(ctx)
    else if (action === 'rotate') await handleRotate(ctx)
    else if (action === 'mint') await handleMint(ctx)
    else if (action === 'delete') await handleDelete(ctx)
    else await handleSet(ctx)
  }
}

if (isMain(import.meta.url)) {
  process.stderr.write('Run this task through bootstrap so prompts and stack context stay aligned.\n')
  process.exit(1)
}
