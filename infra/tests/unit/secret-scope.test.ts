import { describe, expect, it } from 'vitest';
import { runtimeSecrets } from '../../lib/runtime-secrets';
import { buildGrantRows } from '../../lib/scaleway/grant-rows';
import { principalNames } from '../../lib/scaleway/principals';
import { DEPLOY_FOLDER, ENGINE_FOLDER, HANDOFF_FOLDER, secretCopies } from '../../lib/scaleway/secret-paths';
import { principalServices, serviceNames } from '../../lib/services';
import { fakeConfig } from '../helpers/fake-config';

const slug = 'app';
const mode = 'production';

const appConfigFor = (singleVM: boolean) =>
  fakeConfig({
    slug,
    mode,
    singleVM,
    services: Object.fromEntries(serviceNames.map((name) => [name, { enabled: true }])),
  });

/** The folder prefixes a condition grants, from its `resource.name.startsWith("...")` clauses. */
const grantedPrefixes = (condition: string) => [...condition.matchAll(/resource\.name\.startsWith\("([^"]+)"\)/g)].map((match) => match[1] ?? '');

/** Whether a condition lets its principal read the secret named `name` (its full Secret Manager path and name). */
const covers = (condition: string, name: string) => grantedPrefixes(condition).some((prefix) => name.startsWith(prefix));

/** The full Secret Manager name of each copy of a secret, with the consumer it serves. */
const copyNames = (secret: (typeof runtimeSecrets)[number]) =>
  secretCopies(secret).map((copy) => ({ service: copy.service, name: `${copy.path}${secret.secretName}` }));

/** The full name of the copy a given consumer reads. */
const copyFor = (secret: (typeof runtimeSecrets)[number], service: string) => copyNames(secret).find((copy) => copy.service === service)?.name ?? '';

/**
 * A VM principal's grant is conditioned on secret folders, so where a secret lives decides who reads it. Every consumer has its own copy in
 * its own folder: each principal must read exactly the copies of the services its machines carry, and no other service's copy.
 */
describe('secret scope per principal', () => {
  for (const singleVM of [false, true]) {
    const rows = buildGrantRows(appConfigFor(singleVM));
    const names = principalNames(slug, mode);

    it(`must not let a principal read a secret none of its services consume (singleVM: ${singleVM})`, () => {
      for (const svc of principalServices()) {
        const row = rows.find((candidate) => candidate.app === names.vmService(svc.slug));
        if (!row) throw new Error(`no assertion row for ${svc.slug}`);
        const scope = [svc.slug];
        for (const secret of runtimeSecrets) {
          for (const copy of copyNames(secret)) {
            const carries = scope.some((slug) => slug === copy.service);
            expect(covers(row.condition, copy.name), `${svc.slug} reading ${secret.secretName} of ${copy.service}`).toBe(carries);
          }
        }
      }
    });

    it(`must not let the boot key or any VM key read the engine or the deploy folder (singleVM: ${singleVM})`, () => {
      const boot = rows.find((row) => row.app === names.boot);
      if (!boot) throw new Error('no assertion row for the boot principal');
      for (const secret of runtimeSecrets) for (const copy of copyNames(secret)) expect(covers(boot.condition, copy.name)).toBe(false);
      // Positive control: the boot key reads the handoff bundles.
      expect(covers(boot.condition, `${HANDOFF_FOLDER}backend/bundle`)).toBe(true);

      for (const row of rows.filter((candidate) => candidate.app.includes('-vm-') || candidate.app === names.boot)) {
        expect(covers(row.condition, `${ENGINE_FOLDER}pulumi-passphrase`), row.app).toBe(false);
        expect(covers(row.condition, `${DEPLOY_FOLDER}machine-key-backend`), row.app).toBe(false);
      }
    });
  }

  it("must not name a service after a reserved folder, which its own folder's grant would cover", () => {
    for (const reserved of ['shared', 'engine', 'handoff', 'deploy']) expect(serviceNames).not.toContain(reserved);
  });

  it('must not give the Yjs relay the key that signs editor tokens, under split-VM', () => {
    const yjsRow = buildGrantRows(appConfigFor(false)).find((row) => row.app === principalNames(slug, mode).vmService('yjs'));
    const signingKey = runtimeSecrets.find((secret) => secret.envVar === 'YJS_TOKEN_PRIVATE_KEY');
    const publicKey = runtimeSecrets.find((secret) => secret.envVar === 'YJS_TOKEN_PUBLIC_KEY');
    if (!yjsRow || !signingKey || !publicKey) throw new Error('fixture missing');
    for (const copy of copyNames(signingKey)) expect(covers(yjsRow.condition, copy.name), copy.service).toBe(false);
    // Positive control: the relay reads its own copy of the public half.
    expect(covers(yjsRow.condition, copyFor(publicKey, 'yjs'))).toBe(true);
  });
});
