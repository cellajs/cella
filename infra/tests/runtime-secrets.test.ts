import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { appServices, runtimeSecretConsumers, runtimeSecrets, runtimeSecretsForConsumer } from '@cellajs/cli/infra/contract';
import { config } from 'shared/config/config.default';
import { signYjsToken, verifyYjsToken, yjsTokenSigningKey, yjsTokenVerifyKey } from 'shared/utils/yjs-token';
import { describe, expect, it } from 'vitest';
import { serviceSecrets } from '../../backend/src/env-service-secrets';

const readSource = (path: string) => readFileSync(resolve(__dirname, '../..', path), 'utf-8');
const workerEnvBaseSource = readSource('shared/src/utils/worker-env.ts');

// Keyed by the service that builds the image. Shared declarations such as DATABASE_SSL_CA count as declared for cdc and yjs: their env schemas extend workerEnvBase.
const envSources: Readonly<Record<string, string>> = {
  backend: readSource('backend/src/env.ts'),
  cdc: `${workerEnvBaseSource}\n${readSource('cdc/src/env.ts')}`,
  yjs: `${workerEnvBaseSource}\n${readSource('yjs/src/env.ts')}`,
};

const deliveredTo = (service: string) => new Set(runtimeSecretsForConsumer(service).map((secret) => secret.envVar));

describe('runtime secret registry', () => {
  it('does not leak service-exclusive secrets across machine boundaries', () => {
    expect(deliveredTo('cdc').has('YJS_RELAY_SECRET')).toBe(false);
    expect(deliveredTo('yjs').has('CDC_SECRET')).toBe(false);
    expect(deliveredTo('backend').has('DATABASE_CDC_URL')).toBe(false);
  });

  it('derives the relay public key from the signing key, so the two change together', async () => {
    const publicKey = runtimeSecrets.find((secret) => secret.envVar === 'YJS_TOKEN_PUBLIC_KEY');
    const privateKey = runtimeSecrets.find((secret) => secret.envVar === 'YJS_TOKEN_PRIVATE_KEY');
    expect(publicKey?.derivedFrom?.secretId).toBe(privateKey?.id);
    const material = 'key-material-of-at-least-thirty-two-chars';
    const token = signYjsToken(
      { userId: 'u', entityType: 'attachment', entityId: 'e', tenantId: 't', organizationId: 'o' },
      yjsTokenSigningKey(material),
      60_000,
    );
    const derived = (await publicKey?.derivedFrom?.derive(material)) ?? '';
    expect(verifyYjsToken(token, yjsTokenVerifyKey(derived)).ok).toBe(true);
  });
});

describe('runtime secret schema alignment', () => {
  const federationEnvVars = Object.keys(config.federations).flatMap((key) => [
    `SSO_${key.toUpperCase()}_CLIENT_ID`,
    `SSO_${key.toUpperCase()}_CLIENT_SECRET`,
  ]);
  // backend/src/env.ts derives these from the federation keys, and a new app declares none while the registry keeps the template's pair.
  const isFederationEnvVar = (envVar: string) => /^SSO_[A-Z0-9_]+_CLIENT_(ID|SECRET)$/.test(envVar);

  it('delivers the client id and secret of every federation the app config declares', () => {
    for (const envVar of federationEnvVars) expect(deliveredTo('backend'), envVar).toContain(envVar);
  });

  it("declares each delivered variable in the env schema of the service's image", () => {
    for (const secret of runtimeSecrets) {
      if (isFederationEnvVar(secret.envVar)) continue;
      for (const service of secret.services) {
        const image = appServices[service]?.reusesImageOf ?? service;
        const source = envSources[image];
        if (!source) continue;
        expect(source, `${secret.envVar} must be declared in ${image}/src/env.ts when assigned to ${service}`).toContain(`${secret.envVar}:`);
      }
    }
  });

  // The backend image serves each of these on a machine of its own in split mode; the SERVICE its env names picks the process, and
  // a release companion runs one more process (its own SERVICE) on the same machine with the same secrets.
  const backendImageModes = runtimeSecretConsumers.flatMap((slug) => {
    const service = appServices[slug];
    if (!service || (slug !== 'backend' && service.reusesImageOf !== 'backend')) return [];
    const releaseMode = service.release?.env?.SERVICE;
    return [[slug, [service.env?.SERVICE ?? 'api', ...(releaseMode ? [releaseMode] : [])]] as const];
  });

  it('delivers a mode-bound secret to exactly the backend-image machines whose processes read it', () => {
    expect(backendImageModes.map(([slug]) => slug)).toContain('backend');
    for (const [service, vmModes] of backendImageModes) {
      const delivered = deliveredTo(service);
      for (const [envVar, modes] of Object.entries(serviceSecrets)) {
        const reads = modes.some((readingMode) => vmModes.includes(readingMode));
        // Missing, a process's env schema refuses to boot; extra, the machine holds a key none of its processes reads.
        expect(delivered.has(envVar), `${service} (SERVICE=${vmModes.join('+')}) and ${envVar}`).toBe(reads);
      }
    }
  });

  it('delivers the secrets every backend mode requires to each backend-image machine', () => {
    for (const [service] of backendImageModes) {
      const delivered = deliveredTo(service);
      for (const envVar of ['DATABASE_URL', 'COOKIE_SECRET', 'DATA_ENCRYPTION_KEY']) {
        expect(delivered.has(envVar), `${service} and ${envVar}`).toBe(true);
      }
    }
  });
});
