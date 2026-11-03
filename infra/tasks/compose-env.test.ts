import { describe, expect, it } from 'vitest';
import { MAIN_JOB_EXIT } from '../lib/deploy/main-job';
import { runtimeSecretsForConsumer, uploadsKeySecrets } from '../lib/runtime-secrets';
import { servicesByName } from '../lib/services';
import { ExitCodeError } from '../lib/utils/errors';
import { fakeConfig } from '../tests/helpers/fake-config';
import { composeMachineEnvs, machineEnvEntries } from './compose-env';

const everyService = Object.fromEntries([...servicesByName.keys()].map((slug) => [slug, { enabled: true }]));

/** A value for every name, so each env file holds exactly the names its machine carries. */
const valuesFor = (machines: ReturnType<typeof machineEnvEntries>) =>
  new Map<string, string>(machines.flatMap((machine) => machine.entries.map((entry) => [entry.secretName, `value-of-${entry.secretName}`] as const)));

const namesIn = (file: string) =>
  file
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('=')[0]);

/** The names a set of services reads, from the registry: each one's runtime secrets, and the uploads key where one signs uploads. */
const registryNames = (services: string[]) => {
  const names = new Set(services.flatMap((slug) => runtimeSecretsForConsumer(slug as never).map((secret) => secret.envVar)));
  if (services.some((slug) => servicesByName.get(slug as never)?.s3Access)) for (const half of uploadsKeySecrets) names.add(half.envVar);
  return names;
};

describe("a machine's env file", () => {
  it('holds on its own machine exactly the names its service reads in the registry, no other service’s', () => {
    const machines = machineEnvEntries(fakeConfig({ services: everyService }));
    const files = composeMachineEnvs(machines, valuesFor(machines));
    expect(Object.keys(files).sort()).toEqual([...servicesByName.keys()].sort());
    for (const [service, file] of Object.entries(files)) expect(new Set(namesIn(file)), service).toEqual(registryNames([service]));
  });

  it('holds on the singleVM host the names of every service it carries, and the host is the one machine', () => {
    const machines = machineEnvEntries(fakeConfig({ services: everyService, singleVM: true }));
    const files = composeMachineEnvs(machines, valuesFor(machines));
    const [host, ...others] = Object.keys(files);
    expect(others).toEqual([]);
    expect(new Set(namesIn(files[host ?? ''] ?? ''))).toEqual(registryNames([...servicesByName.keys()]));
  });

  it('ends the deploy blocked, naming every required value owed, before any machine is made', () => {
    const machines = machineEnvEntries(fakeConfig({ services: everyService }));
    const values = valuesFor(machines);
    values.delete('cookie-secret');
    values.set('cdc-secret', 'two\nlines');
    const error = (() => {
      try {
        composeMachineEnvs(machines, values);
      } catch (thrown) {
        return thrown;
      }
    })();
    expect(error).toBeInstanceOf(ExitCodeError);
    expect((error as ExitCodeError).exitCode).toBe(MAIN_JOB_EXIT.blocked);
    expect((error as Error).message).toContain('COOKIE_SECRET [cookie-secret]');
    expect((error as Error).message).toContain('CDC_SECRET [cdc-secret]');
  });
});
