import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ProvisionContext } from '../../lib/stores';
import { flushPulumi, installPulumiMocks, type MockHarness } from '../../tests/helpers/pulumi-mock';

// Importing postgres-managed.ts pulls in the Pulumi resource graph (pulumi-context,
// network) at module load, so prime the runtime mocks first. The provisioner's
// resources are created inside provision(), rendered below against the mocks.
let formatPostgresUrl: (user: string, pass: string, host: string, port: number | string, database: string) => string;
let postgresManaged: typeof import('./postgres-managed').postgresManaged;
let harness: MockHarness;
let ctx: ProvisionContext;

beforeAll(async () => {
  // `bootstrap:computeDeferred` disables the compute pin-guard so the module
  // imports without requiring pinned image tags.
  harness = await installPulumiMocks({ stack: 'production', config: { 'bootstrap:computeDeferred': 'test' } });
  ({ formatPostgresUrl, postgresManaged } = await import('./postgres-managed'));
  const { pulumi } = harness;
  ctx = {
    pulumi,
    scaleway: await import('@pulumiverse/scaleway'),
    naming: { resource: (name) => `app-${name}`, dbName: 'app' },
    region: 'nl-ams',
    zone: 'nl-ams-1',
    isProduction: true,
    sizing: { dbNodeType: 'DB-DEV-S', dbVolumeSize: 10 },
    privateNetworkId: 'pn-id',
    configuredOrRandomSecret: () => pulumi.output('secret'),
  };
});

describe('formatPostgresUrl', () => {
  it('assembles a DSN with host, port and database in place', () => {
    expect(formatPostgresUrl('admin', 'pw', 'db.internal', 5432, 'app')).toBe(
      'postgresql://admin:pw@db.internal:5432/app?sslmode=require&uselibpqcompat=true',
    );
  });

  it('always pins sslmode=require and uselibpqcompat=true', () => {
    const url = formatPostgresUrl('u', 'p', 'h', 1234, 'd');
    expect(url).toContain('?sslmode=require&uselibpqcompat=true');
  });

  it('accepts a string port', () => {
    expect(formatPostgresUrl('u', 'p', 'h', '6432', 'd')).toContain('@h:6432/d');
  });

  it('percent-encodes a user and password that contain URI metacharacters', () => {
    const url = formatPostgresUrl('user@org', 'p@ss:w/rd?#&', 'h', 5432, 'd');
    expect(url).toBe('postgresql://user%40org:p%40ss%3Aw%2Frd%3F%23%26@h:5432/d?sslmode=require&uselibpqcompat=true');
  });

  it('keeps a password with @ and : from breaking out of the userinfo segment', () => {
    // Authority must split into exactly userinfo + host:port. The encoded
    // password cannot inject a second `@` or `:` that re-parses the host.
    const url = formatPostgresUrl('u', 'p@ss:bad@host', 'real-host', 5432, 'd');
    const authority = url.slice('postgresql://'.length, url.indexOf('/d?'));
    const [userinfo, hostport] = authority.split('@');
    expect(hostport).toBe('real-host:5432');
    expect(userinfo).toBe('u:p%40ss%3Abad%40host');
  });
});

describe('postgresManaged public endpoint ACL', () => {
  const configKeys = ['infra:dbPublicEndpoint', 'infra:dbPublicAcl', 'infra:dbPublicAclAllowWide'];

  /** Renders the store with the given `infra:*` stack config and returns the ACL rules it declared, if any. */
  async function render(config: Record<string, string>) {
    for (const [key, value] of Object.entries(config)) harness.pulumi.runtime.setConfig(key, value);
    harness.resources.length = 0;
    postgresManaged().provision(ctx);
    await flushPulumi();
    const instance = harness.oneOfType('scaleway:databases/instance:Instance');
    const acls = harness.byType('scaleway:databases/acl:Acl');
    return { instance, rules: acls[0]?.inputs.aclRules as { ip: string }[] | undefined };
  }

  afterEach(() => {
    const all = harness.pulumi.runtime.allConfig();
    for (const key of configKeys) delete all[key];
    harness.pulumi.runtime.setAllConfig(all);
  });

  it('keeps the database private by default: no public endpoint, no ACL', async () => {
    const { instance, rules } = await render({});
    expect(instance.inputs.loadBalancer).toBeUndefined();
    expect(rules).toBeUndefined();
  });

  it('must not expose the database to the internet via an all-internet ACL', async () => {
    for (const acl of ['0.0.0.0/0', '::/0', '203.0.113.7, 0.0.0.0/0']) {
      await expect(render({ 'infra:dbPublicEndpoint': 'true', 'infra:dbPublicAcl': acl })).rejects.toThrow(
        /Security: infra:dbPublicAcl/,
      );
    }
  });

  it('must not expose the database to a wide range via a short prefix', async () => {
    for (const acl of ['198.51.0.0/16', '2001:db8::/32']) {
      await expect(render({ 'infra:dbPublicEndpoint': 'true', 'infra:dbPublicAcl': acl })).rejects.toThrow(
        /dbPublicAclAllowWide/,
      );
    }
  });

  it('accepts a wide range only with the explicit escape hatch, and never the whole internet', async () => {
    const wide = await render({
      'infra:dbPublicEndpoint': 'true',
      'infra:dbPublicAcl': '198.51.0.0/16',
      'infra:dbPublicAclAllowWide': 'true',
    });
    expect(wide.rules?.map((rule) => rule.ip)).toEqual(['198.51.0.0/16']);
    await expect(
      render({
        'infra:dbPublicEndpoint': 'true',
        'infra:dbPublicAcl': '0.0.0.0/0',
        'infra:dbPublicAclAllowWide': 'true',
      }),
    ).rejects.toThrow(/entire internet/);
  });

  it('declares the operator ACL as canonical CIDRs (positive control)', async () => {
    const { instance, rules } = await render({
      'infra:dbPublicEndpoint': 'true',
      'infra:dbPublicAcl': '203.0.113.7, 198.51.100.0/24',
    });
    expect(instance.inputs.loadBalancer).toEqual({});
    expect(rules?.map((rule) => rule.ip)).toEqual(['203.0.113.7/32', '198.51.100.0/24']);
  });
});
