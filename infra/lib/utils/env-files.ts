import { chmodSync, existsSync, readFileSync, statSync } from 'node:fs';
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
