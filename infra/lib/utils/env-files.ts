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
  for (const [key, value] of Object.entries(parseEnvFile(modeEnvPath))) process.env[key] = value;
  log(`Loaded ${modeEnvPath} (mode-scoped env, overrides ambient values)`);
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
