import { describe, expect, it } from 'vitest';
import type { EngineConfig } from '../../config/engine-config';
import { runtimeSecrets } from '../../lib/runtime-secrets';
import { principalNames } from '../../lib/scaleway/principals';
import { engineSecretPath, handoffFolderPath, secretPathFor } from '../../lib/scaleway/secret-paths';
import { buildVmAssertRows } from '../../lib/scaleway/vm-assert-rows';
import { principalSecretScopeSlugs, principalServices, serviceNames } from '../../lib/services';

const slug = 'app';
const mode = 'production';

const appConfigFor = (singleVM: boolean): EngineConfig => ({
  slug,
  mode,
  domain: 'app.example',
  frontendUrl: 'https://www.app.example',
  backendUrl: 'https://www.app.example/api',
  singleVM,
  s3: {
    region: 'nl-ams',
    host: 's3.nl-ams.scw.cloud',
    publicBucket: 'app-public',
    privateBucket: 'app-private',
    publicCDNUrl: '',
    privateCDNUrl: '',
  },
  services: Object.fromEntries(serviceNames.map((service) => [service, { enabled: true }])),
});

/** The folder prefixes a condition grants, from its `resource.name.startsWith("...")` clauses. */
const grantedPrefixes = (condition: string) =>
  [...condition.matchAll(/resource\.name\.startsWith\("([^"]+)"\)/g)].map((match) => match[1] ?? '');

/** Whether a condition lets its principal read the secret named `name` (its full Secret Manager path and name). */
const covers = (condition: string, name: string) =>
  grantedPrefixes(condition).some((prefix) => name.startsWith(prefix));

const secretName = (secret: (typeof runtimeSecrets)[number]) =>
  `${secretPathFor(secret, slug, mode)}${secret.secretName}`;

/**
 * A VM principal's grant is conditioned on secret folders, so where a secret lives decides who reads it: a folder
 * holding secrets of several consumer sets hands every one of them to each set's services. Each principal must read
 * exactly the secrets its services consume, the ones the deploy delivers to its VMs.
 */
describe('secret scope per principal', () => {
  for (const singleVM of [false, true]) {
    const rows = buildVmAssertRows(appConfigFor(singleVM));
    const names = principalNames(slug, mode);

    it(`must not let a principal read a secret none of its services consume (singleVM: ${singleVM})`, () => {
      for (const svc of principalServices(singleVM)) {
        const row = rows.find((candidate) => candidate.app === names.vmService(svc.slug));
        if (!row) throw new Error(`no assertion row for ${svc.slug}`);
        const scope = principalSecretScopeSlugs(singleVM, svc.slug);
        for (const secret of runtimeSecrets) {
          const consumes = secret.services.some((service) => scope.some((slug) => slug === service));
          expect(covers(row.condition, secretName(secret)), `${svc.slug} reading ${secret.secretName}`).toBe(consumes);
        }
      }
    });

    it(`must not let the boot key or any VM key read the engine folder (singleVM: ${singleVM})`, () => {
      const boot = rows.find((row) => row.app === names.boot);
      if (!boot) throw new Error('no assertion row for the boot principal');
      for (const secret of runtimeSecrets) expect(covers(boot.condition, secretName(secret))).toBe(false);
      // Positive control: the boot key reads the handoff bundles.
      expect(covers(boot.condition, `${handoffFolderPath(slug, mode)}backend/bundle`)).toBe(true);

      for (const row of rows.filter((candidate) => candidate.app.includes('-vm-'))) {
        expect(covers(row.condition, `${engineSecretPath(slug, mode)}admin-key`), row.app).toBe(false);
      }
    });
  }

  it("must not name a service after a reserved folder, which its own folder's grant would cover", () => {
    for (const reserved of ['shared', 'engine', 'handoff']) expect(serviceNames).not.toContain(reserved);
  });

  it('must not give the Yjs relay the key that signs editor tokens, under split-VM', () => {
    const yjsRow = buildVmAssertRows(appConfigFor(false)).find(
      (row) => row.app === principalNames(slug, mode).vmService('yjs'),
    );
    const signingKey = runtimeSecrets.find((secret) => secret.envVar === 'YJS_TOKEN_PRIVATE_KEY');
    const publicKey = runtimeSecrets.find((secret) => secret.envVar === 'YJS_TOKEN_PUBLIC_KEY');
    if (!yjsRow || !signingKey || !publicKey) throw new Error('fixture missing');
    expect(covers(yjsRow.condition, secretName(signingKey))).toBe(false);
    // Positive control: the relay reads the public half.
    expect(covers(yjsRow.condition, secretName(publicKey))).toBe(true);
  });
});
