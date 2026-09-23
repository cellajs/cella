import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseEnvFile, writeEnvValues } from './env-files';

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
