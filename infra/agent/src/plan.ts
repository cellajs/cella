import { isRecord } from '../../lib/guards'

export const supportedSchemaVersion = 1
export const supportedImageContract = 'docker-node-agent-v1'

export interface RuntimeSecretManifestEntry {
  envVar: string
  secretId: string
  required: boolean
}

export interface BootPlan {
  schemaVersion: typeof supportedSchemaVersion
  service: string
  profile: string
  releaseSha: string
  imageContract: typeof supportedImageContract
  registry: string
  region: string
  credentials: {
    scwAccessKeyFile: string
    scwSecretKeyFile: string
  }
  bootDiagnostics: {
    bucket: string
    logFile: string
  }
  releaseCommand: {
    enabled: boolean
    command: string[]
  }
  docker: {
    composeFile: string
  }
  files: {
    compose: string
    env: string
    runtimeSecretManifest: RuntimeSecretManifestEntry[]
  }
  timeouts: {
    privateNetworkSeconds: number
    pullAttempts: number
    pullRetrySeconds: number
  }
}

const topLevelKeys = new Set([
  'schemaVersion',
  'service',
  'profile',
  'releaseSha',
  'imageContract',
  'registry',
  'region',
  'credentials',
  'bootDiagnostics',
  'releaseCommand',
  'docker',
  'files',
  'timeouts',
])

function stringField(obj: Record<string, unknown>, key: string): string {
  const value = obj[key]
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`boot plan: '${key}' must be a non-empty string`)
  return value
}

function booleanField(obj: Record<string, unknown>, key: string): boolean {
  const value = obj[key]
  if (typeof value !== 'boolean') throw new Error(`boot plan: '${key}' must be a boolean`)
  return value
}

function numberField(obj: Record<string, unknown>, key: string): number {
  const value = obj[key]
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error(`boot plan: '${key}' must be a positive number`)
  return value
}

function objectField(obj: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = obj[key]
  if (!isRecord(value)) throw new Error(`boot plan: '${key}' must be an object`)
  return value
}

function assertKnownTopLevel(obj: Record<string, unknown>): void {
  for (const key of Object.keys(obj)) {
    if (!topLevelKeys.has(key)) throw new Error(`boot plan: unknown top-level field '${key}'`)
  }
}

function assertAllowedPath(path: string): void {
  const allowed = ['/opt/app/', '/etc/cella/', '/etc/runtime-secrets/', '/var/log/']
  if (!allowed.some((prefix) => path.startsWith(prefix))) throw new Error(`boot plan: path '${path}' is outside the allowed boot paths`)
}

function commandField(obj: Record<string, unknown>, key: string): string[] {
  const value = obj[key]
  if (!Array.isArray(value) || value.length === 0) throw new Error(`boot plan: '${key}' must be a non-empty command array`)
  const command = value.map((part) => {
    if (typeof part !== 'string' || part === '') throw new Error(`boot plan: '${key}' contains an empty or non-string command argument`)
    return part
  })
  return command
}

/** Validate a runtime-secret manifest value. Also used by the boot-plan
 *  producer (resources/cloud-init.ts) so a malformed manifest fails at plan
 *  time instead of at VM boot. */
export function parseRuntimeSecretManifest(value: unknown): RuntimeSecretManifestEntry[] {
  if (!Array.isArray(value)) throw new Error("boot plan: 'runtimeSecretManifest' must be an array")
  return value.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`boot plan: runtimeSecretManifest[${index}] must be an object`)
    return {
      envVar: stringField(entry, 'envVar'),
      secretId: stringField(entry, 'secretId'),
      required: booleanField(entry, 'required'),
    }
  })
}

export function parseBootPlanJson(json: string): BootPlan {
  const parsed = JSON.parse(json) as unknown
  if (!isRecord(parsed)) throw new Error('boot plan: root must be an object')
  assertKnownTopLevel(parsed)

  const schemaVersion = parsed.schemaVersion
  if (schemaVersion !== supportedSchemaVersion) throw new Error(`boot plan: unsupported schemaVersion '${String(schemaVersion)}'`)
  const imageContract = parsed.imageContract
  if (imageContract !== supportedImageContract) throw new Error(`boot plan: unsupported imageContract '${String(imageContract)}'`)

  const credentials = objectField(parsed, 'credentials')
  const bootDiagnostics = objectField(parsed, 'bootDiagnostics')
  const releaseCommand = objectField(parsed, 'releaseCommand')
  const docker = objectField(parsed, 'docker')
  const files = objectField(parsed, 'files')
  const timeouts = objectField(parsed, 'timeouts')

  const scwAccessKeyFile = stringField(credentials, 'scwAccessKeyFile')
  const scwSecretKeyFile = stringField(credentials, 'scwSecretKeyFile')
  const logFile = stringField(bootDiagnostics, 'logFile')
  const composeFile = stringField(docker, 'composeFile')
  for (const path of [scwAccessKeyFile, scwSecretKeyFile, logFile, composeFile]) assertAllowedPath(path)

  return {
    schemaVersion,
    service: stringField(parsed, 'service'),
    profile: stringField(parsed, 'profile'),
    releaseSha: stringField(parsed, 'releaseSha'),
    imageContract,
    registry: stringField(parsed, 'registry'),
    region: stringField(parsed, 'region'),
    credentials: { scwAccessKeyFile, scwSecretKeyFile },
    bootDiagnostics: {
      bucket: stringField(bootDiagnostics, 'bucket'),
      logFile,
    },
    releaseCommand: {
      enabled: booleanField(releaseCommand, 'enabled'),
      command: commandField(releaseCommand, 'command'),
    },
    docker: { composeFile },
    files: {
      compose: stringField(files, 'compose'),
      env: stringField(files, 'env'),
      runtimeSecretManifest: parseRuntimeSecretManifest(files.runtimeSecretManifest),
    },
    timeouts: {
      privateNetworkSeconds: numberField(timeouts, 'privateNetworkSeconds'),
      pullAttempts: numberField(timeouts, 'pullAttempts'),
      pullRetrySeconds: numberField(timeouts, 'pullRetrySeconds'),
    },
  }
}
