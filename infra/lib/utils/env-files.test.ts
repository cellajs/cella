import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type ExecLike,
  keychainReference,
  parseEnvFile,
  parseSecretReference,
  resolveSecretReference,
  storeInKeychain,
  writeEnvValues,
} from './env-files';

describe('writeEnvValues', () => {
  it('creates the file mode 0600 with one line per value', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'envw-')), '.env.production');
    writeEnvValues(path, { SCW_ACCESS_KEY: 'SCWA', SCW_SECRET_KEY: 's3cret' });
    expect(readFileSync(path, 'utf8')).toBe('SCW_ACCESS_KEY=SCWA\nSCW_SECRET_KEY=s3cret\n');
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it('updates existing keys in place and keeps every other line and comment', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'envw-')), '.env.production');
    writeFileSync(
      path,
      '# operator keys\nPULUMI_CONFIG_PASSPHRASE="pass"\nSCW_ACCESS_KEY=old\nexport SCW_SECRET_KEY=old-secret\n',
    );
    writeEnvValues(path, { SCW_ACCESS_KEY: 'new', SCW_SECRET_KEY: 'new-secret', SCW_STATE_ACCESS_KEY: 'st' });
    expect(readFileSync(path, 'utf8')).toBe(
      '# operator keys\nPULUMI_CONFIG_PASSPHRASE="pass"\nSCW_ACCESS_KEY=new\nSCW_SECRET_KEY=new-secret\nSCW_STATE_ACCESS_KEY=st\n',
    );
    expect(parseEnvFile(path)).toMatchObject({
      PULUMI_CONFIG_PASSPHRASE: 'pass',
      SCW_ACCESS_KEY: 'new',
      SCW_SECRET_KEY: 'new-secret',
    });
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
    expect(parseSecretReference('op:op://Infra/scaleway-owner/secret')).toEqual({
      kind: 'op',
      ref: 'op://Infra/scaleway-owner/secret',
    });
    expect(parseSecretReference('plain-value')).toBeUndefined();
    expect(resolveSecretReference('X', 'plain-value', exec({ status: 1 }))).toBe('plain-value');
  });

  it('reads a keychain entry through the platform tool and strips the trailing newline', () => {
    calls.length = 0;
    expect(resolveSecretReference('P', 'keychain:svc/acct', exec({ status: 0, stdout: 'hunter2\n' }), 'darwin')).toBe(
      'hunter2',
    );
    expect(calls[0]).toEqual({
      cmd: 'security',
      args: ['find-generic-password', '-s', 'svc', '-a', 'acct', '-w'],
      input: undefined,
    });
    calls.length = 0;
    expect(resolveSecretReference('P', 'keychain:svc/acct', exec({ status: 0, stdout: 'hunter2' }), 'linux')).toBe(
      'hunter2',
    );
    expect(calls[0]?.cmd).toBe('secret-tool');
  });

  it('names the missing entry and how to store it', () => {
    expect(() =>
      resolveSecretReference('P', 'keychain:svc/acct', exec({ status: 44, stderr: 'not found' }), 'darwin'),
    ).toThrow(/P: keychain entry svc\/acct not found .*Store passphrase in keychain/);
    expect(() => resolveSecretReference('K', 'op:op://v/i/f', exec({ status: 1, stderr: 'not signed in' }))).toThrow(
      /1Password read of op:\/\/v\/i\/f failed \(not signed in\)/,
    );
  });

  it('stores a value and yields the matching reference', () => {
    calls.length = 0;
    storeInKeychain('cella-production', 'PULUMI_CONFIG_PASSPHRASE', 's3cret', exec({ status: 0 }), 'darwin');
    expect(calls[0]?.args).toEqual([
      'add-generic-password',
      '-U',
      '-s',
      'cella-production',
      '-a',
      'PULUMI_CONFIG_PASSPHRASE',
      '-w',
      's3cret',
    ]);
    calls.length = 0;
    storeInKeychain('cella-production', 'PULUMI_CONFIG_PASSPHRASE', 's3cret', exec({ status: 0 }), 'linux');
    expect(calls[0]?.input).toBe('s3cret');
    expect(keychainReference('cella-production', 'PULUMI_CONFIG_PASSPHRASE')).toBe(
      'keychain:cella-production/PULUMI_CONFIG_PASSPHRASE',
    );
  });
});
