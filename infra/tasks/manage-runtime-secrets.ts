import { randomBytes } from 'node:crypto'
import pc from 'shared/cli-utils/colors'
import { checkMark, tildeMark, warningMark } from 'shared/console'
import { isMain } from '../lib/is-main'
import { runtimeSecrets, type RuntimeSecretDefinition } from '../lib/runtime-secrets'
import { createSecretManagerClient } from '../lib/scaleway-secret-manager'

type PromptOption<T extends string> = { name: string; value: T; description?: string }

/**
 * Resolved by a selection prompt when the operator presses Esc to step back to
 * the previous menu instead of choosing an option. A symbol so it can never
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
  path: string
  prompts: RuntimeSecretPrompts
  log?: (message: string) => void
}

type ManagedRuntimeSecret = RuntimeSecretDefinition
type Action = 'list' | 'set' | 'delete' | 'rotate' | 'exit'

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

export async function manageRuntimeSecrets(options: ManageRuntimeSecretsOptions): Promise<void> {
  const log = options.log ?? defaultLog
  const client = createSecretManagerClient({
    secretKey: options.secretKey,
    region: options.region,
    projectId: options.projectId,
  })
  const secrets = operatorManagedSecrets()

  // Explain up front when a change actually reaches the running services, so an
  // operator doesn't expect an instant deploy. Each VM's reconciler re-syncs the
  // runtime secrets on its ~20s tick and rolls the affected services when a value
  // changes (see infra/README.md). The trailing newline leaves a blank line
  // before the menu.
  log(
    `${pc.dim('Changes are applied gradually, not instantly. Each VM re-syncs runtime secrets roughly every 20s and rolls')}\n` +
      `${pc.dim('the affected services when a value changes, so updates go live within a minute — no redeploy needed.')}\n`,
  )

  // Loop the menu so an operator setting up a fresh environment can manage
  // several secrets in one session instead of re-running the CLI per secret.
  // Each leaf action returns here; "Exit" (or Esc) is the only way out.
  while (true) {
    const action = await options.prompts.select<Action>({
      message: 'Manage runtime secrets',
      choices: [
        { name: 'List', value: 'list', description: 'Show operator-managed runtime secrets and whether a secret object exists.' },
        { name: 'Set or update', value: 'set', description: 'Create a new secret version for a selected runtime secret.' },
        { name: 'Rotate', value: 'rotate', description: 'Generate a fresh random value for a selected runtime secret when supported.' },
        { name: 'Delete', value: 'delete', description: 'Delete an entire runtime secret object after confirmation.' },
        { name: 'Exit', value: 'exit', description: 'Leave the runtime secrets menu.' },
      ],
    })

    // Esc on the top menu behaves like "Exit" — there is no parent menu to return
    // to (the infra CLI exits once secrets management is done).
    if (action === BACK || action === 'exit') return

    if (action === 'list') {
      const existing = await client.listSecrets(options.path)
      const byName = new Map(existing.map((secret) => [secret.name, secret]))
      log(`\n${pc.bold('Runtime secrets')} ${pc.dim(options.path)}`)
      for (const secret of secrets) {
        const current = byName.get(secret.secretName)
        // A secret *object* can exist with zero versions (created but never given a
        // value). Only a versioned secret actually has content the services can read,
        // so gate "present" on version_count — otherwise an empty container reports a
        // false positive. The in-between state (object, no version) is called out
        // explicitly so the operator knows to run "Set or update".
        const status = !current
          ? `${tildeMark} missing`
          : (current.version_count ?? 0) > 0
            ? `${checkMark} present`
            : `${warningMark} empty (no version — run "Set or update")`
        log(`- ${secret.secretName} (${secret.envVar}) — ${status}; consumers: ${secret.services.join(', ')}`)
      }
      continue
    }

    if (action === 'rotate') {
      const rotatable = secrets.filter((secret) => secret.generation === 'random')
      if (rotatable.length === 0) {
        log(`${tildeMark} No operator-managed runtime secrets support random rotation yet.`)
        continue
      }
      const selectedId = await options.prompts.select<string>({
        message: 'Select a runtime secret to rotate (Esc to go back)',
        choices: rotatable.map(formatSecretChoice),
      })
      if (selectedId === BACK) continue
      const secret = rotatable.find((entry) => entry.id === selectedId)!
      const ensured = await client.ensureSecret({
        name: secret.secretName,
        path: options.path,
        description: secret.description,
      })
      await client.putSecretValue({
        secretId: ensured.id,
        value: generateRandomRuntimeSecret(),
        description: 'Rotated by bootstrap manage secrets',
        disablePrevious: true,
      })
      log(`${checkMark} Rotated ${secret.secretName}`)
      continue
    }

    const selectedId = await options.prompts.select<string>({
      message: action === 'delete' ? 'Select a runtime secret to delete (Esc to go back)' : 'Select a runtime secret to set (Esc to go back)',
      choices: secrets.map(formatSecretChoice),
    })
    if (selectedId === BACK) continue
    const secret = secrets.find((entry) => entry.id === selectedId)!
    const existingSecret = await client.getSecretByName(secret.secretName, options.path)

    if (action === 'delete') {
      if (!existingSecret) {
        log(`${tildeMark} ${secret.secretName} does not exist in ${options.path}`)
        continue
      }
      const confirmed = await options.prompts.confirm({
        message: `${warningMark} Delete secret object ${secret.secretName} (${secret.envVar}) for ${secret.services.join(', ')}?`,
        default: false,
      })
      if (!confirmed) {
        log(`${tildeMark} Deletion cancelled.`)
        continue
      }
      await client.deleteSecret(existingSecret.id)
      log(`${checkMark} Deleted ${secret.secretName}`)
      continue
    }

    // Trim so accidental leading/trailing whitespace (e.g. from a paste) never
    // becomes part of the stored secret; validate on the trimmed length so an
    // all-whitespace entry is rejected the same as an empty one.
    const value = (
      await options.prompts.password({
        message: `New value for ${secret.secretName}`,
        validate: (input) => input.trim().length > 0 || 'Value is required',
      })
    ).trim()
    const ensured =
      existingSecret ??
      (await client.ensureSecret({
        name: secret.secretName,
        path: options.path,
        description: secret.description,
      }))
    await client.putSecretValue({
      secretId: ensured.id,
      value,
      description: 'Updated by bootstrap manage secrets',
      disablePrevious: true,
    })
    log(`${checkMark} Updated ${secret.secretName} ${pc.dim(`(${value.length} chars)`)}`)
  }
}

if (isMain(import.meta.url)) {
  process.stderr.write('Run this task through bootstrap so prompts and stack context stay aligned.\n')
  process.exit(1)
}