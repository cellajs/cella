import { describe, expect, it, vi } from 'vitest';
import { expectAllowed, expectDenied, isAccessDenied, validateStateBucketPolicy } from './validate-state-bucket-policy';

const denied = (status = 403) => Object.assign(new Error('AccessDenied'), { $metadata: { httpStatusCode: status } });

describe('isAccessDenied', () => {
  it('recognises a 403 status', () => {
    expect(isAccessDenied({ $metadata: { httpStatusCode: 403 } })).toBe(true);
  });
  it('recognises an AccessDenied name or Code', () => {
    expect(isAccessDenied({ name: 'AccessDenied' })).toBe(true);
    expect(isAccessDenied({ Code: 'AccessDenied' })).toBe(true);
  });
  it('does not treat other errors as denials', () => {
    expect(isAccessDenied({ $metadata: { httpStatusCode: 500 } })).toBe(false);
    expect(isAccessDenied(new Error('network'))).toBe(false);
  });
});

describe('expectAllowed', () => {
  it('passes when the call succeeds', async () => {
    await expect(expectAllowed('op', async () => {})).resolves.toMatchObject({ ok: true, expected: 'allowed' });
  });
  it('fails when the call throws', async () => {
    const check = await expectAllowed('op', async () => {
      throw denied();
    });
    expect(check.ok).toBe(false);
    expect(check.detail).toMatch(/expected success but failed/);
  });
});

describe('expectDenied', () => {
  it('passes when the call is denied with a 403', async () => {
    const check = await expectDenied('del', async () => {
      throw denied();
    });
    expect(check.ok).toBe(true);
    expect(check.detail).toMatch(/denied as expected/);
  });
  it('fails loudly when the call SUCCEEDS (policy not effective)', async () => {
    const check = await expectDenied('del', async () => {});
    expect(check.ok).toBe(false);
    expect(check.detail).toMatch(/SUCCEEDED/);
  });
  it('flags a non-403 error as inconclusive rather than a pass', async () => {
    const check = await expectDenied('del', async () => {
      throw denied(500);
    });
    expect(check.ok).toBe(false);
    expect(check.detail).toMatch(/inconclusive/);
  });
});

describe('validateStateBucketPolicy', () => {
  /**
   * Fake S3 client. `deny` is a predicate over each command's class name and input; it lets a test
   * deny only a version-delete (DeleteObjectCommand carrying a VersionId) while allowing a plain
   * DeleteObject, mirroring how the live policy splits s3:DeleteObjectVersion from s3:DeleteObject.
   */
  const client = (deny: (kind: string, input: { VersionId?: string }) => boolean = () => false) => {
    const send = vi.fn(async (cmd: { constructor: { name: string }; input: { VersionId?: string } }) => {
      const kind = cmd.constructor.name;
      if (deny(kind, cmd.input ?? {})) throw denied();
      if (kind === 'PutObjectCommand') return { VersionId: 'v1' };
      if (kind === 'ListObjectVersionsCommand')
        return { Versions: [{ Key: 'probe', VersionId: 'v1' }], DeleteMarkers: [] };
      return {};
    });
    // biome-ignore lint/suspicious/noExplicitAny: minimal mock surface
    return { send } as any;
  };

  const ciDenials = (kind: string, input: { VersionId?: string }) =>
    (kind === 'DeleteObjectCommand' && Boolean(input.VersionId)) || kind === 'PutBucketVersioningCommand';

  it('reports all checks passing when the operator is unrestricted and CI is denied version deletes', async () => {
    const operatorS3 = client();
    const ciS3 = client(ciDenials);
    const checks = await validateStateBucketPolicy({
      operatorS3,
      ciS3,
      bucket: 'cella-pulumi-state',
      probeKey: 'probe',
      log: () => {},
    });
    expect(checks.every((c) => c.ok)).toBe(true);
    expect(checks.find((c) => c.name.includes('DeleteObjectVersion'))?.ok).toBe(true);
  });

  it('fails the denial check when the CI key can still delete versions', async () => {
    const operatorS3 = client();
    const ciS3 = client((kind) => kind === 'PutBucketVersioningCommand'); // version delete NOT denied
    const checks = await validateStateBucketPolicy({
      operatorS3,
      ciS3,
      bucket: 'cella-pulumi-state',
      probeKey: 'probe',
      log: () => {},
    });
    const versionCheck = checks.find((c) => c.name.includes('DeleteObjectVersion'));
    expect(versionCheck?.ok).toBe(false);
    expect(versionCheck?.detail).toMatch(/SUCCEEDED/);
  });

  it('fails an allowed check when the operator has lost read access', async () => {
    const operatorS3 = client((kind) => kind === 'GetObjectCommand');
    const ciS3 = client(ciDenials);
    const checks = await validateStateBucketPolicy({
      operatorS3,
      ciS3,
      bucket: 'cella-pulumi-state',
      probeKey: 'probe',
      log: () => {},
    });
    const opRead = checks.find((c) => c.name === 'operator: GetObject');
    expect(opRead?.ok).toBe(false);
  });
});
