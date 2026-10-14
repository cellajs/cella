import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  dropPromptOnlyEnv,
  type ExecLike,
  modeEnvValues,
  parseEnvFile,
  parseSecretReference,
  RETIRED_KEY_NAMES,
  resolveSecretReference,
  writeEnvValues,
} from './env-files';

describe('dropPromptOnlyEnv', () => {
  it('takes a privileged key and the passphrase out of the environment and names what it found', () => {
    const env: NodeJS.ProcessEnv = { PULUMI_CONFIG_PASSPHRASE: 'p', SCW_OWNER_SECRET_KEY: 's', SCW_ADMIN_SECRET_KEY: 'a', PATH: '/bin' };
    expect(dropPromptOnlyEnv(env)).toEqual(['PULUMI_CONFIG_PASSPHRASE', 'SCW_OWNER_SECRET_KEY']);
    expect(env).toEqual({ SCW_ADMIN_SECRET_KEY: 'a', PATH: '/bin' });
  });

  it('finds nothing in a clean environment', () => {
    expect(dropPromptOnlyEnv({ PATH: '/bin' })).toEqual([]);
  });
});

describe('modeEnvValues', () => {
  it('must not read the retired admin application key, under its own names or the superseded ones, and says to remove them', () => {
    const { values, warnings } = modeEnvValues(
      { SCW_ADMIN_ACCESS_KEY: 'SCWA', SCW_ADMIN_SECRET_KEY: 's', SCW_ACCESS_KEY: 'OLD', SCW_SECRET_KEY: 'o', SCW_PROJECT_ID: 'p' },
      'production',
    );
    expect(values).toEqual({ SCW_PROJECT_ID: 'p' });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/infra\/\.env\.production: SCW_ADMIN_ACCESS_KEY, SCW_ADMIN_SECRET_KEY, SCW_ACCESS_KEY, SCW_SECRET_KEY are not read/);
  });

  it('must not export a privileged key or the passphrase from the file, in any form: a value on disk would run the CLI unattended', () => {
    const { values, warnings } = modeEnvValues(
      {
        SCW_OBSERVER_ACCESS_KEY: 'SCWO',
        SCW_OBSERVER_SECRET_KEY: 's',
        PULUMI_CONFIG_PASSPHRASE: 'keychain:cella-production/PULUMI_CONFIG_PASSPHRASE',
        SCW_OWNER_ACCESS_KEY: 'SCWOWNER',
        SCW_OWNER_SECRET_KEY: 'op:op://Infra/owner/secret',
        SCW_BOOTSTRAP_KEY: 'SCWOLD',
      },
      'production',
    );
    expect(values).toEqual({ SCW_OBSERVER_ACCESS_KEY: 'SCWO', SCW_OBSERVER_SECRET_KEY: 's' });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/PULUMI_CONFIG_PASSPHRASE, SCW_OWNER_ACCESS_KEY, SCW_OWNER_SECRET_KEY, SCW_BOOTSTRAP_KEY are not read/);
  });

  it('passes the observer key through untouched', () => {
    expect(modeEnvValues({ SCW_OBSERVER_ACCESS_KEY: 'SCWO', SCW_OBSERVER_SECRET_KEY: 's' }, 'staging')).toEqual({
      values: { SCW_OBSERVER_ACCESS_KEY: 'SCWO', SCW_OBSERVER_SECRET_KEY: 's' },
      warnings: [],
    });
  });
});

describe('writeEnvValues', () => {
  it('creates the file mode 0600 with one line per value', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'envw-')), '.env.production');
    writeEnvValues(path, { SCW_ACCESS_KEY: 'SCWA', SCW_SECRET_KEY: 's3cret' });
    expect(readFileSync(path, 'utf8')).toBe('SCW_ACCESS_KEY=SCWA\nSCW_SECRET_KEY=s3cret\n');
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it('updates existing keys in place and keeps every other line and comment', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'envw-')), '.env.production');
    writeFileSync(path, '# operator keys\nPULUMI_CONFIG_PASSPHRASE="pass"\nSCW_ACCESS_KEY=old\nexport SCW_SECRET_KEY=old-secret\n');
    writeEnvValues(path, { SCW_ACCESS_KEY: 'new', SCW_SECRET_KEY: 'new-secret', SCW_STATE_ACCESS_KEY: 'st' });
    expect(readFileSync(path, 'utf8')).toBe(
      '# operator keys\nPULUMI_CONFIG_PASSPHRASE="pass"\nSCW_ACCESS_KEY=new\nSCW_SECRET_KEY=new-secret\nSCW_STATE_ACCESS_KEY=st\n',
    );
    expect(parseEnvFile(path)).toMatchObject({ PULUMI_CONFIG_PASSPHRASE: 'pass', SCW_ACCESS_KEY: 'new', SCW_SECRET_KEY: 'new-secret' });
  });

  it('removes superseded names on request and reports which ones it found', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'envw-')), '.env.production');
    writeFileSync(path, 'SCW_ADMIN_ACCESS_KEY=old\nSCW_ADMIN_SECRET_KEY=o\nSCW_STATE_ACCESS_KEY=st\nPULUMI_CONFIG_PASSPHRASE=p\n');
    const removed = writeEnvValues(path, { SCW_OBSERVER_ACCESS_KEY: 'SCWO', SCW_OBSERVER_SECRET_KEY: 's' }, { remove: RETIRED_KEY_NAMES });
    expect(removed).toEqual(['SCW_ADMIN_ACCESS_KEY', 'SCW_ADMIN_SECRET_KEY', 'SCW_STATE_ACCESS_KEY']);
    expect(readFileSync(path, 'utf8')).toBe('PULUMI_CONFIG_PASSPHRASE=p\nSCW_OBSERVER_ACCESS_KEY=SCWO\nSCW_OBSERVER_SECRET_KEY=s\n');
  });

  it('refuses a value that spans lines', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'envw-')), '.env.staging');
    expect(() => writeEnvValues(path, { X: 'a\nb' })).toThrow(/cannot span lines/);
  });
});

describe('secret references', () => {
  const calls: Array<{ cmd: string; args: string[]; input?: string }> = [];
  const exec =
    (answer: { status: number; stdout?: string; stderr?: string }): ExecLike =>
    (cmd, args, input) => {
      calls.push({ cmd, args, input });
      return { status: answer.status, stdout: answer.stdout ?? '', stderr: answer.stderr ?? '' };
    };

  it('parses the two reference forms and passes literals through', () => {
    expect(parseSecretReference('keychain:cella-production/PULUMI_CONFIG_PASSPHRASE')).toEqual({
      kind: 'keychain',
      service: 'cella-production',
      account: 'PULUMI_CONFIG_PASSPHRASE',
    });
    expect(parseSecretReference('op:op://Infra/scaleway-owner/secret')).toEqual({ kind: 'op', ref: 'op://Infra/scaleway-owner/secret' });
    expect(parseSecretReference('plain-value')).toBeUndefined();
    expect(resolveSecretReference('X', 'plain-value', exec({ status: 1 }))).toBe('plain-value');
  });

  it('reads a keychain entry through the platform tool and strips the trailing newline', () => {
    calls.length = 0;
    expect(resolveSecretReference('P', 'keychain:svc/acct', exec({ status: 0, stdout: 'hunter2\n' }), 'darwin')).toBe('hunter2');
    expect(calls[0]).toEqual({ cmd: 'security', args: ['find-generic-password', '-s', 'svc', '-a', 'acct', '-w'], input: undefined });
    calls.length = 0;
    expect(resolveSecretReference('P', 'keychain:svc/acct', exec({ status: 0, stdout: 'hunter2' }), 'linux')).toBe('hunter2');
    expect(calls[0]?.cmd).toBe('secret-tool');
  });

  it('names the missing entry', () => {
    expect(() => resolveSecretReference('P', 'keychain:svc/acct', exec({ status: 44, stderr: 'not found' }), 'darwin')).toThrow(
      /P: keychain entry svc\/acct not found \(security could not read it; not found\)/,
    );
    expect(() => resolveSecretReference('K', 'op:op://v/i/f', exec({ status: 1, stderr: 'not signed in' }))).toThrow(
      /1Password read of op:\/\/v\/i\/f failed \(not signed in\)/,
    );
  });
});
