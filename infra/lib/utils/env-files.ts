import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { infraDir } from './paths';

/** Parse a dotenv-style file into key/value pairs (no interpolation). */
export function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    out[match[1]!] = (match[2] ?? '').replace(/^['"]|['"]$/g, '');
  }
  return out;
}

/** Load backend/.env before the root fallback so infra tasks share the app's local config. Existing environment variables keep precedence over both files. */
export function loadBaseEnvFiles(): void {
  for (const envFile of [resolve(infraDir, '..', 'backend', '.env'), resolve(infraDir, '..', '.env')]) {
    if (existsSync(envFile)) process.loadEnvFile(envFile);
  }
}

/** Load `infra/.env.<mode>`, which overrides the ambient env so a staging run cannot inherit production values. The file holds a live secret key and Pulumi passphrase, so it is tightened to 0600 on sight. */
export function loadModeEnvFile(mode: string, log: (message: string) => void = () => {}): void {
  // A bare infra/.env is never read; naming the file that is read saves a round of prompts for the values it holds.
  const strayEnvPath = resolve(infraDir, '.env');
  if (existsSync(strayEnvPath))
    log(
      `${strayEnvPath} is not read: mode-scoped credentials live in infra/.env.${mode} (infra/README.md, Credentials files).`,
    );
  const modeEnvPath = resolve(infraDir, `.env.${mode}`);
  if (!existsSync(modeEnvPath)) return;
  const fileMode = statSync(modeEnvPath).mode;
  if ((fileMode & 0o077) !== 0) {
    chmodSync(modeEnvPath, 0o600);
    log(`Tightened ${modeEnvPath} to 600 (was ${(fileMode & 0o777).toString(8)}): it carries live credentials.`);
  }
  for (const [key, value] of Object.entries(parseEnvFile(modeEnvPath)))
    process.env[key] = resolveSecretReference(key, value);
  log(`Loaded ${modeEnvPath} (mode-scoped env, overrides ambient values)`);
}

/** Minimal command runner, injectable for tests. */
export type ExecLike = (
  cmd: string,
  args: string[],
  input?: string,
) => { status: number | null; stdout: string; stderr: string };

const defaultExec: ExecLike = (cmd, args, input) => {
  const res = spawnSync(cmd, args, {
    encoding: 'utf8',
    input,
    stdio: [input === undefined ? 'inherit' : 'pipe', 'pipe', 'pipe'],
  });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
};

/** `keychain:<service>/<account>` → the OS keychain entry; `op:<op://vault/item/field>` → the 1Password CLI. Anything else is the literal value. */
export function parseSecretReference(
  value: string,
): { kind: 'keychain'; service: string; account: string } | { kind: 'op'; ref: string } | undefined {
  const keychain = value.match(/^keychain:([^/]+)\/(.+)$/);
  if (keychain) return { kind: 'keychain', service: keychain[1] as string, account: keychain[2] as string };
  const op = value.match(/^op:(op:\/\/.+)$/);
  if (op) return { kind: 'op', ref: op[1] as string };
  return undefined;
}

/**
 * Resolve a secret reference to its value at load time, so a passphrase or key can live in the OS keychain or a password manager while the env file
 * holds only a pointer. A literal value passes through untouched. A reference that cannot be read throws with the command to fix it.
 */
export function resolveSecretReference(
  key: string,
  value: string,
  exec: ExecLike = defaultExec,
  platform = process.platform,
): string {
  const ref = parseSecretReference(value);
  if (!ref) return value;
  const fail = (what: string, detail: string) => new Error(`${key}: ${what} (${detail.trim() || 'no output'})`);
  if (ref.kind === 'op') {
    const res = exec('op', ['read', ref.ref]);
    if (res.status !== 0) throw fail(`1Password read of ${ref.ref} failed`, res.stderr);
    return res.stdout.replace(/\r?\n$/, '');
  }
  const [cmd, args] =
    platform === 'darwin'
      ? ['security', ['find-generic-password', '-s', ref.service, '-a', ref.account, '-w']]
      : ['secret-tool', ['lookup', 'service', ref.service, 'account', ref.account]];
  const res = exec(cmd, args);
  if (res.status !== 0 || res.stdout === '') {
    throw fail(
      `keychain entry ${ref.service}/${ref.account} not found`,
      `store it with: pnpm infra → Manage keys & secrets → Store passphrase in keychain, or ${cmd} directly; ${res.stderr}`,
    );
  }
  return res.stdout.replace(/\r?\n$/, '');
}

/** Write a secret into the OS keychain under `service`/`account`, replacing an existing entry. */
export function storeInKeychain(
  service: string,
  account: string,
  value: string,
  exec: ExecLike = defaultExec,
  platform = process.platform,
): void {
  const res =
    platform === 'darwin'
      ? exec('security', ['add-generic-password', '-U', '-s', service, '-a', account, '-w', value])
      : exec('secret-tool', ['store', `--label=${service} ${account}`, 'service', service, 'account', account], value);
  if (res.status !== 0)
    throw new Error(`keychain write for ${service}/${account} failed (${res.stderr.trim() || 'no output'})`);
}

/** The reference `resolveSecretReference` reads back for a keychain entry. */
export function keychainReference(service: string, account: string): string {
  return `keychain:${service}/${account}`;
}

/** Path of the mode-scoped operator env file. */
export function modeEnvPath(mode: string): string {
  return resolve(infraDir, `.env.${mode}`);
}

/**
 * Write (or update) values in a dotenv-style file, keeping every other line and comment as it is, creating the file mode 0600.
 * Values are written unquoted on one line each; a newline in a value is refused, as `isEnvFileDeliverable` would.
 */
export function writeEnvValues(path: string, values: Record<string, string>): void {
  for (const [key, value] of Object.entries(values)) {
    if (/[\r\n]/.test(value)) throw new Error(`${key}: a value cannot span lines in ${path}`);
  }
  const lines = existsSync(path) ? readFileSync(path, 'utf8').split('\n') : [];
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  const pending = new Map(Object.entries(values));
  const out = lines.map((line) => {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    const key = match?.[1];
    if (!key || !pending.has(key)) return line;
    const value = pending.get(key) as string;
    pending.delete(key);
    return `${key}=${value}`;
  });
  for (const [key, value] of pending) out.push(`${key}=${value}`);
  writeFileSync(path, `${out.join('\n')}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

/** Write values into `infra/.env.<mode>`, the file `loadModeEnvFile` reads. */
export function writeModeEnvValues(mode: string, values: Record<string, string>): string {
  const path = modeEnvPath(mode);
  writeEnvValues(path, values);
  return path;
}
