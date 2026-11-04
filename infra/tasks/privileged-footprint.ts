import { writeFileSync } from 'node:fs';
import type { PrivilegedFootprint } from '../lib/stack/privileged-footprint';
import { runIfMain } from '../lib/utils/is-main';
import { getFlag } from './args';

/** The project and organization a keyless render names: fixed words, so a base and a head render compare on what the code declares. */
const PROJECT = 'project';
const ORGANIZATION = 'organization';

/**
 * Render what one environment's code declares that only an Owner moment or an apply writes, without a key and without Scaleway: the
 * identities with their policies, and every resource of the Pulumi program with its inputs, under mocks (lib/stack/keyless-render.ts): the
 * program holds the foundation only, as a deploy makes the machines. The stack file is not read: the committed one holds markers only, and a database's exposure lives
 * in the operator's own overlay. Writes JSON to `--out`; the pull request check compares a base's with a head's (tasks/privileged-check.ts).
 */
export async function main(argv = process.argv.slice(2)): Promise<void> {
  const mode = getFlag(argv, '--mode');
  const out = getFlag(argv, '--out');
  if (!mode || !out) throw new Error('Usage: privileged-footprint.ts --mode <environment> --out <file>');

  // Before anything imports @pulumi/pulumi or the shared config, which read these at evaluation.
  process.env.PULUMI_NODEJS_PROJECT = 'infra';
  process.env.PULUMI_NODEJS_STACK = mode;
  process.env.APP_MODE = mode;
  process.env.SCW_DEFAULT_PROJECT_ID = PROJECT;
  process.env.SCW_DEFAULT_ORGANIZATION_ID = ORGANIZATION;
  // The program sends a key with its IPAM read; keylessFetch answers that read itself, so this word goes nowhere.
  process.env.SCW_SECRET_KEY = 'keyless';
  // One digest for every render, so the main job compares on its script and env: the image an apply builds is no code of the change.
  process.env.INFRA_ENGINE_IMAGE = `rg.keyless/engine/infra-engine@sha256:${'0'.repeat(64)}`;

  const { engineConfig: appConfig } = await import('../config/engine-config');
  const pulumi = await import('@pulumi/pulumi');
  const { installKeylessMocks, keylessFetch, settleRender } = await import('../lib/stack/keyless-render');
  const { declaredIdentities } = await import('../lib/scaleway/declared-identities');

  globalThis.fetch = keylessFetch;
  const rendered = installKeylessMocks(pulumi, { project: 'infra', stack: mode, preview: false });
  await import('../resources/program');
  await settleRender(rendered);
  const { appDescriptionHash } = await import('../lib/deploy/app-description');

  const footprint: PrivilegedFootprint = {
    environment: mode,
    identities: declaredIdentities(appConfig, { projectId: PROJECT, organizationId: ORGANIZATION }),
    description: await appDescriptionHash(),
    resources: rendered
      .map(({ type, name, inputs }) => ({ type, name, inputs }))
      .sort((a, b) => `${a.type} ${a.name}`.localeCompare(`${b.type} ${b.name}`)),
  };
  writeFileSync(out, `${JSON.stringify(footprint, null, 2)}\n`);
}

runIfMain(import.meta.url, main);
