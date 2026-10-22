import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ProvisionContext } from '../../lib/stores';
import { installPulumiMocks, type MockHarness } from '../../tests/helpers/pulumi-mock';

// Importing postgres-managed.ts pulls in the Pulumi resource graph (pulumi-context,
// network) at module load, so prime the runtime mocks first. The provisioner's
// resources are created inside provision(), rendered below against the mocks.
let postgresManaged: typeof import('./postgres-managed').postgresManaged;
let harness: MockHarness;
let ctx: ProvisionContext;

beforeAll(async () => {
  harness = await installPulumiMocks({ deferCompute: true });
  ({ postgresManaged } = await import('./postgres-managed'));
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

describe('postgresManaged public endpoint ACL', () => {
  const configKeys = ['infra:dbPublicEndpoint', 'infra:dbPublicAcl', 'infra:dbPublicAclAllowWide'];

  /** Renders the store with the given `infra:*` stack config and returns the ACL rules it declared, if any. */
  async function render(config: Record<string, string>) {
    for (const [key, value] of Object.entries(config)) harness.pulumi.runtime.setConfig(key, value);
    harness.resources.length = 0;
    postgresManaged().provision(ctx);
    await harness.settle();
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
    expect(instance.inputs.privateNetwork).toEqual({ pnId: 'pn-id', enableIpam: true });
    expect(rules).toBeUndefined();
  });

  it('must not hold a database password in the state: the program declares no role, privilege or password', async () => {
    await render({});
    expect(harness.byType('scaleway:databases/user:User')).toEqual([]);
    expect(harness.byType('scaleway:databases/privilege:Privilege')).toEqual([]);
    expect(harness.byType('random:index/randomPassword:RandomPassword')).toEqual([]);
  });

  it("must not open the endpoint without an ACL: it would run on Scaleway's default rule 0.0.0.0/0", async () => {
    await expect(render({ 'infra:dbPublicEndpoint': 'true' })).rejects.toThrow(/Security: infra:dbPublicAcl/);
  });

  it('must not expose the database to the internet via an all-internet ACL', async () => {
    for (const acl of ['0.0.0.0/0', '::/0', '203.0.113.7, 0.0.0.0/0']) {
      await expect(render({ 'infra:dbPublicEndpoint': 'true', 'infra:dbPublicAcl': acl })).rejects.toThrow(/Security: infra:dbPublicAcl/);
    }
  });

  it('must not expose the database to a wide range via a short prefix', async () => {
    await expect(render({ 'infra:dbPublicEndpoint': 'true', 'infra:dbPublicAcl': '198.51.0.0/16' })).rejects.toThrow(/dbPublicAclAllowWide/);
  });

  it('accepts a wide range only with the explicit escape hatch, and never the whole internet', async () => {
    const wide = await render({ 'infra:dbPublicEndpoint': 'true', 'infra:dbPublicAcl': '198.51.0.0/16', 'infra:dbPublicAclAllowWide': 'true' });
    expect(wide.rules?.map((rule) => rule.ip)).toEqual(['198.51.0.0/16']);
    await expect(
      render({ 'infra:dbPublicEndpoint': 'true', 'infra:dbPublicAcl': '0.0.0.0/0', 'infra:dbPublicAclAllowWide': 'true' }),
    ).rejects.toThrow(/entire internet/);
  });

  it('declares the operator ACL as canonical CIDRs (positive control)', async () => {
    const { instance, rules } = await render({ 'infra:dbPublicEndpoint': 'true', 'infra:dbPublicAcl': '203.0.113.7, 198.51.100.0/24' });
    expect(instance.inputs.loadBalancer).toEqual({});
    expect(rules?.map((rule) => rule.ip)).toEqual(['203.0.113.7/32', '198.51.100.0/24']);
  });
});
