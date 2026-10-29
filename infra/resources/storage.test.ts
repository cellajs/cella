import { beforeAll, describe, expect, it } from 'vitest';
import { engineConfig } from '../config/engine-config';
import { appPrincipalNames, principalNames } from '../lib/scaleway/principals';
import { principalServices } from '../lib/services';
import { installPulumiMocks, type MockHarness } from '../tests/helpers/pulumi-mock';

let h: MockHarness;

beforeAll(async () => {
  // The mock IAM API supplies CI and VM application IDs normally absent from stack config.
  h = await installPulumiMocks({ deferCompute: true });
  await import('./storage');
  await h.settle();
});

describe('storage module', () => {
  it('creates exactly four Object Storage buckets', () => {
    const buckets = h.resources.filter((r) => /bucket(?!Policy|Website)/i.test(r.type) && !/Policy|Website/i.test(r.type));
    expect(buckets.map((b) => b.name).sort(), `captured: ${h.resources.map((r) => r.type).join(', ')}`).toEqual([
      'boot-diag-bucket',
      'frontend-bucket',
      'private-uploads-bucket',
      'public-uploads-bucket',
    ]);
  });

  it('must not let anyone but a named application write or list: the public read only fetches objects of the two public buckets', () => {
    type Statement = { Sid: string; Effect: string; Principal: unknown; Action: string[]; Resource: string[] };
    const policies = h.resources.filter((r) => /bucketPolicy/i.test(r.type));
    expect(policies.map((p) => p.name).sort()).toEqual(['boot-diag-policy', 'frontend-policy', 'private-uploads-policy', 'public-uploads-policy']);
    const publicReads: string[] = [];
    for (const policy of policies) {
      const bucket = String(h.resources.find((r) => r.name === policy.name.replace(/-policy$/, '-bucket'))?.inputs.name);
      const { Statement } = JSON.parse(String(policy.inputs.policy)) as { Statement: Statement[] };
      expect(Statement.length, policy.name).toBeGreaterThan(0);
      for (const statement of Statement) {
        expect(statement.Effect, `${policy.name} ${statement.Sid}`).toBe('Allow');
        if (statement.Principal === '*') {
          // Anonymous access: object reads on this bucket's objects, nothing else.
          expect(statement.Action, `${policy.name} ${statement.Sid}`).toEqual(['s3:GetObject']);
          expect(statement.Resource, `${policy.name} ${statement.Sid}`).toEqual([`${bucket}/*`]);
          publicReads.push(policy.name);
        } else {
          expect(statement.Principal, `${policy.name} ${statement.Sid}`).toEqual({ SCW: expect.stringMatching(/^application_id:.+/) });
        }
      }
    }
    // Positive control: the SPA bucket and the public uploads are readable; the private uploads and the boot diagnostics are not.
    expect(publicReads.sort()).toEqual(['frontend-policy', 'public-uploads-policy']);
  });

  it("admits the app's operator on every bucket, so an apply on the operator key can refresh and change them", () => {
    type Statement = { Sid: string; Principal: unknown; Action: string[] };
    for (const policy of h.resources.filter((r) => /bucketPolicy/i.test(r.type))) {
      const { Statement } = JSON.parse(String(policy.inputs.policy)) as { Statement: Statement[] };
      const operator = Statement.find((statement) => statement.Sid === 'OperatorAccess');
      expect(operator?.Principal, policy.name).toEqual({ SCW: `application_id:${appPrincipalNames(engineConfig().appSlug).operator}-id` });
      expect(operator?.Action, policy.name).toEqual(['s3:*']);
    }
  });

  it("lets the deploy key at objects only, and at no user's file: no bucket configuration, no policy, no version deleted", () => {
    type Statement = { Sid: string; Action: string[]; Resource: string[] };
    for (const policy of h.resources.filter((r) => /bucketPolicy/i.test(r.type))) {
      const { Statement } = JSON.parse(String(policy.inputs.policy)) as { Statement: Statement[] };
      const deploy = Statement.find((statement) => statement.Sid === 'DeployAccess');
      if (policy.name === 'private-uploads-policy') {
        expect(deploy, policy.name).toBeUndefined();
        continue;
      }
      expect(deploy, policy.name).toBeDefined();
      if (policy.name === 'public-uploads-policy') expect(deploy?.Resource.at(-1), policy.name).toMatch(/\/geoip\/\*$/);
      for (const action of deploy?.Action ?? []) {
        expect(action, policy.name).toMatch(
          /^s3:(ListBucket|ListBucketMultipartUploads|ListMultipartUploadParts|GetObject|PutObject|DeleteObject|AbortMultipartUpload)$/,
        );
      }
    }
  });

  it('must not admit the retired admin application outside the run that admits the operator with its key', () => {
    for (const policy of h.resources.filter((r) => /bucketPolicy/i.test(r.type))) {
      expect(String(policy.inputs.policy), policy.name).not.toContain(principalNames(engineConfig().slug, 'production').admin);
    }
  });

  it('must not let the observer read user data: of the app buckets it reads the boot diagnostics only', () => {
    type Statement = { Sid: string; Principal: unknown; Action: string[] };
    for (const policy of h.resources.filter((r) => /bucketPolicy/i.test(r.type))) {
      const { Statement } = JSON.parse(String(policy.inputs.policy)) as { Statement: Statement[] };
      const observer = Statement.filter((statement) =>
        JSON.stringify(statement.Principal).includes(`${appPrincipalNames(engineConfig().appSlug).observer}-id`),
      );
      if (policy.name === 'boot-diag-policy') {
        expect(observer.map((statement) => statement.Action)).toEqual([['s3:ListBucket', 's3:GetObject']]);
      } else {
        expect(observer, policy.name).toEqual([]);
      }
    }
  });

  it("lets each machine key write its own reports only: a service's boot accounts, the builder's reports", () => {
    type Statement = { Sid: string; Principal: { SCW: string }; Action: string[]; Resource: string[] };
    const bucket = String(h.resources.find((r) => r.name === 'boot-diag-bucket')?.inputs.name);
    const { Statement } = JSON.parse(String(h.resources.find((r) => r.name === 'boot-diag-policy')?.inputs.policy)) as { Statement: Statement[] };
    const names = principalNames(engineConfig().slug, 'production');
    // Beside the deploy key, which writes the run records, and the operator's `s3:*`.
    const writes = Statement.filter((statement) => statement.Action.includes('s3:PutObject') && statement.Sid !== 'DeployAccess');
    expect(writes.map((statement) => [statement.Principal.SCW, statement.Action, statement.Resource])).toEqual([
      ...principalServices().map((svc) => [
        `application_id:${names.vmService(svc.slug)}-id`,
        ['s3:PutObject'],
        [`${bucket}/boot-diag/${svc.slug}-*`],
      ]),
      [`application_id:${names.builder}-id`, ['s3:PutObject'], [`${bucket}/boot-diag/builder/*`]],
    ]);
  });

  it('upload buckets restrict CORS allowedOrigins (no wildcard)', () => {
    const uploadBuckets = h.resources.filter(
      (r) => /bucket(?!Policy|Website)/i.test(r.type) && !/Policy|Website/i.test(r.type) && /uploads/i.test(r.name),
    );
    expect(uploadBuckets.length).toBeGreaterThan(0);
    for (const b of uploadBuckets) {
      const cors = (b.inputs.corsRules as any[]) ?? [];
      expect(cors.length, `${b.name} should have CORS rules`).toBeGreaterThan(0);
      for (const rule of cors) {
        expect(rule.allowedOrigins).not.toContain('*');
        expect(rule.allowedMethods).toEqual(expect.arrayContaining(['GET']));
      }
    }
  });

  it('provisions no S3 website hosting (Caddy owns the SPA fallback over the REST endpoint)', () => {
    expect(h.resources.filter((r) => /bucketWebsiteConfiguration/i.test(r.type))).toHaveLength(0);
  });

  it('frontend bucket expires stale assets/ chunks but never root entry files', () => {
    const bucket = h.resources.find((r) => r.name === 'frontend-bucket');
    expect(bucket).toBeDefined();
    const rules = (bucket?.inputs.lifecycleRules as any[]) ?? [];
    const assetRule = rules.find((r) => r.id === 'expire-stale-assets');
    expect(assetRule, 'expire-stale-assets lifecycle rule must exist').toBeDefined();
    expect(assetRule.enabled).toBe(true);
    // Prefix-scoped to assets/ so root entry files (index.html, sw.js, ...) are untouched.
    expect(assetRule.prefix).toBe('assets/');
    expect(assetRule.expiration?.days).toBeGreaterThan(0);
  });

  it('frontend bucket purges noncurrent versions and orphaned delete markers', () => {
    const bucket = h.resources.find((r) => r.name === 'frontend-bucket');
    expect(bucket).toBeDefined();
    const rules = (bucket?.inputs.lifecycleRules as any[]) ?? [];
    const rule = rules.find((r) => r.id === 'cleanup-old-versions');
    expect(rule, 'cleanup-old-versions lifecycle rule must exist').toBeDefined();
    expect(rule.enabled).toBe(true);
    // Noncurrent versions keep their original keys: they are not addressable
    // via a key prefix, so cleanup must use noncurrentVersionExpiration. A
    // prefix-scoped expiration matches nothing and retains versions forever.
    expect(rule.prefix ?? '').toBe('');
    expect(rule.noncurrentVersionExpiration?.noncurrentDays).toBeGreaterThan(0);
    expect(rule.expiration?.expiredObjectDeleteMarker).toBe(true);
    expect(rule.expiration?.days, 'expiredObjectDeleteMarker cannot combine with expiration.days').toBeUndefined();
  });

  it('boot diagnostics bucket expires old boot-diag objects', () => {
    const bucket = h.resources.find((r) => r.name === 'boot-diag-bucket');
    expect(bucket).toBeDefined();
    const rules = (bucket?.inputs.lifecycleRules as any[]) ?? [];
    const rule = rules.find((r) => r.id === 'expire-boot-diag');
    expect(rule).toBeDefined();
    expect(rule.enabled).toBe(true);
    expect(rule.prefix).toBe('boot-diag/');
    expect(rule.expiration?.days).toBeGreaterThan(0);
  });
});
