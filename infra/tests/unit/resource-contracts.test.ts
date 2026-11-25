import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (resource: string) => readFileSync(resolve(__dirname, '../../resources', resource), 'utf-8');

// Resource options never reach a mock render (resources/*.test.ts assert the rendered inputs), so the ones that keep live resources alive are pinned on the source.
describe('resource options', () => {
  it('protects the database instance and its database alone: a replace deletes their data before a successor exists, and a teardown lifts every protection before its destroy', () => {
    const database = 'stores/postgres-managed.ts';
    const sources = readdirSync(resolve(__dirname, '../../resources'), { recursive: true, encoding: 'utf-8' }).filter(
      (file) => file.endsWith('.ts') && !file.endsWith('.test.ts') && file !== database,
    );
    for (const file of sources) expect(read(file), file).not.toMatch(/\bprotect:/);
    expect(read(database).match(/\bprotect: true/g)).toHaveLength(2);
    expect(readFileSync(resolve(__dirname, '../../cli/actions/teardown.ts'), 'utf-8')).toMatch(/'state', 'unprotect', '--all'/);
  });

  it('leaves what a teardown keeps live through a destroy by hand: the upload and boot-diag buckets with their policies, the state bucket policy, the keys that protect stored data', () => {
    expect(read('storage.ts').match(/^\s+kept,$/gm)).toHaveLength(6);
    expect(read('state-bucket-policy.ts')).toMatch(/retainOnDelete: true/);
    expect(read('secrets.ts')).toMatch(/retainOnDelete: protectsStoredData\(definition\)/);
  });

  it('declares no machine: a deploy makes and deletes them, so the state holds none and the deploy key needs no state', () => {
    const sources = readdirSync(resolve(__dirname, '../../resources'), { recursive: true, encoding: 'utf-8' }).filter(
      (file) => file.endsWith('.ts') && !file.endsWith('.test.ts'),
    );
    for (const file of sources) expect(read(file), file).not.toMatch(/instance\.(Server|PrivateNic|Ip)\(/);
  });

  it('lets no pool drift from the program: a deploy moves traffic by health and writes none', () => {
    expect(read('loadbalancer.ts')).not.toMatch(/ignoreChanges:\s*\[[^\]]*'serverIps'/);
  });

  // Known gaps, listed here so a reviewer sees them in `pnpm test` output.
  it.todo('publishes a DMARC TXT record (p=quarantine or p=reject)');
  it.todo('production instance runs as HA cluster (isHaCluster: true)');
});
