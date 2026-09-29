import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (resource: string) => readFileSync(resolve(__dirname, '../../resources', resource), 'utf-8');

// Resource options never reach a mock render (resources/*.test.ts assert the rendered inputs), so the ones that keep live resources alive are pinned on the source.
describe('resource options', () => {
  it('protects the production database instance from deletion', () => {
    expect(read('stores/postgres-managed.ts')).toMatch(/protect:\s*isProduction/);
  });

  it('keeps generation VMs immutable: cloud-init and image drift never replace a live VM outside a cutover', () => {
    expect(read('compute.ts')).toMatch(/ignoreChanges: \['cloudInit', 'image'\]/);
  });

  it('lets the cutover task own the live LB server lists', () => {
    // Pulumi seeds serverIps, then ignores drift so tasks/cutover.ts can expand and contract them with SetBackendServers.
    expect(read('loadbalancer.ts').match(/ignoreChanges:\s*\['serverIps'\]/g)).toHaveLength(2);
  });

  // Known gaps, listed here so a reviewer sees them in `pnpm test` output.
  it.todo('publishes a DMARC TXT record (p=quarantine or p=reject)');
  it.todo('production instance runs as HA cluster (isHaCluster: true)');
  it.todo('production instance has automated backups (disableBackup: false)');
});
