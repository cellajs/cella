import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import pc from 'shared/cli-utils/colors'
import { checkMark, tildeMark, warningMark } from 'shared/console'
import { runtimeSecrets, type RuntimeSecretDefinition } from '../src/runtime-secrets.js'
import { createSecretManagerClient } from '../src/scaleway-secret-manager.js'

type PromptOption<T extends string> = { name: string; value: T; description?: string }

export interface RuntimeSecretPrompts {
  select<T extends string>(options: { message: string; choices: Array<PromptOption<T>> }): Promise<T>
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
type Action = 'list' | 'set' | 'delete' | 'rotate'

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

  const action = await options.prompts.select<Action>({
    message: 'Manage runtime secrets',
    choices: [
      { name: 'List', value: 'list', description: 'Show operator-managed runtime secrets and whether a secret object exists.' },
      { name: 'Set or update', value: 'set', description: 'Create a new secret version for a selected runtime secret.' },
      { name: 'Rotate', value: 'rotate', description: 'Generate a fresh random value for a selected runtime secret when supported.' },
      { name: 'Delete', value: 'delete', description: 'Delete an entire runtime secret object after confirmation.' },
    ],
  })

  if (action === 'list') {
    const existing = await client.listSecrets(options.path)
    const byName = new Map(existing.map((secret) => [secret.name, secret]))
    log(`\n${pc.bold('Runtime secrets')} ${pc.dim(options.path)}`)
    for (const secret of secrets) {
      const current = byName.get(secret.secretName)
      const status = current ? `${checkMark} present` : `${tildeMark} missing`
      log(`- ${secret.secretName} (${secret.envVar}) — ${status}; consumers: ${secret.services.join(', ')}`)
    }
    return
  }

  if (action === 'rotate') {
    const rotatable = secrets.filter((secret) => secret.generation === 'random')
    if (rotatable.length === 0) {
      log(`${tildeMark} No operator-managed runtime secrets support random rotation yet.`)
      return
    }
    const selectedId = await options.prompts.select<string>({
      message: 'Select a runtime secret to rotate',
      choices: rotatable.map(formatSecretChoice),
    })
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
    return
  }

  const selectedId = await options.prompts.select<string>({
    message: action === 'delete' ? 'Select a runtime secret to delete' : 'Select a runtime secret to set',
    choices: secrets.map(formatSecretChoice),
  })
  const secret = secrets.find((entry) => entry.id === selectedId)!
  const existingSecret = await client.getSecretByName(secret.secretName, options.path)

  if (action === 'delete') {
    if (!existingSecret) {
      log(`${tildeMark} ${secret.secretName} does not exist in ${options.path}`)
      return
    }
    const confirmed = await options.prompts.confirm({
      message: `${warningMark} Delete secret object ${secret.secretName} (${secret.envVar}) for ${secret.services.join(', ')}?`,
      default: false,
    })
    if (!confirmed) {
      log(`${tildeMark} Deletion cancelled.`)
      return
    }
    await client.deleteSecret(existingSecret.id)
    log(`${checkMark} Deleted ${secret.secretName}`)
    return
  }

  const value = await options.prompts.password({
    message: `New value for ${secret.secretName}`,
    validate: (input) => input.length > 0 || 'Value is required',
  })
  const ensured = existingSecret ?? await client.ensureSecret({
    name: secret.secretName,
    path: options.path,
    description: secret.description,
  })
  await client.putSecretValue({
    secretId: ensured.id,
    value,
    description: 'Updated by bootstrap manage secrets',
    disablePrevious: true,
  })
  log(`${checkMark} Updated ${secret.secretName}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stderr.write('Run this task through bootstrap so prompts and stack context stay aligned.\n')
  process.exit(1)
}