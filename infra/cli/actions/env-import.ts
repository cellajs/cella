import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { actionLabel } from '../../lib/operator-actions';
import { runtimeSecrets } from '../../lib/runtime-secrets';
import { resolveOperatorIdentity } from '../../lib/scaleway/operator-identity';
import { createSecretManagerClient } from '../../lib/scaleway/scaleway-secret-manager';
import { checkMark, pc, tildeMark, warningMark } from '../../lib/utils/cli-output';
import { parseEnvText, rootEnvFile } from '../../lib/utils/env-files';
import { errorMessage } from '../../lib/utils/errors';
import { formatEnvImport, planEnvImport, readContainers, type SecretManagerClient, setValue } from '../../tasks/manage-runtime-secrets';
import { confirm, input } from '../prompts/back';
import type { InfraContext } from '../shared';
import { acquireOperatorKey, type OperatorKey } from './operator-unlock';
import { applyFirst, offerDeploy } from './secrets';

export interface EnvImportOptions {
  /** The key the runtime folder is read with: the observer key, or the operator key on a machine without one. */
  readKey: string;
  /** The operator key, which every write runs on: asked for at the first write. */
  writeKey: () => Promise<string>;
  projectId: string;
  region: string;
  /** The environment, named in the confirmation. */
  mode: string;
  prompts: {
    input(options: { message: string }): Promise<string>;
    confirm(options: { message: string; default?: boolean }): Promise<boolean>;
  };
  log?: (message: string) => void;
}

/**
 * Set each operator value a `.env` file holds, after a preview and one confirmation. The preview names the value each one replaces, and a
 * warning names this checkout's own `.env`, whose values are for local development. The first write asks for the operator key.
 * @returns Whether a value changed.
 */
export async function importEnvFile(options: EnvImportOptions): Promise<{ changed: boolean }> {
  const log = options.log ?? ((message) => console.info(message));
  const scope = { region: options.region, projectId: options.projectId };
  log(`\n${pc.bold(actionLabel('env-import'))}`);
  log(pc.dim('For a move from another host, such as the file heroku config -s writes.\n'));
  const path = (await options.prompts.input({ message: 'File' })).trim();
  if (!path) {
    log(`${tildeMark} No file given.`);
    return { changed: false };
  }
  let text: string;
  try {
    text = readFileSync(resolve(path), 'utf8');
  } catch (error) {
    log(`${warningMark} ${path} could not be read: ${errorMessage(error)}`);
    return { changed: false };
  }
  if (resolve(path) === rootEnvFile()) log(`${warningMark} ${path} is this checkout's own .env: its values are for local development.`);

  const containers = await readContainers(createSecretManagerClient({ secretKey: options.readKey, ...scope }));
  const lines = planEnvImport(parseEnvText(text), runtimeSecrets, containers);
  for (const line of formatEnvImport(lines)) log(line);
  const writes = lines.flatMap((line) => (line.write ? [line.write] : []));
  if (writes.length === 0) {
    log(`${tildeMark} ${path} holds no value to set here.`);
    return { changed: false };
  }
  const values = `${writes.length} value${writes.length === 1 ? '' : 's'}`;
  if (!(await options.prompts.confirm({ message: `Set ${values} in ${options.mode}?`, default: false }))) {
    log(`${tildeMark} Import cancelled.`);
    return { changed: false };
  }
  let writer: SecretManagerClient | undefined;
  let written = 0;
  for (const { definition, value } of writes) {
    const container = containers.get(definition.secretName);
    if (!container) {
      applyFirst(log, definition, 'import the file again');
      continue;
    }
    writer ??= createSecretManagerClient({ secretKey: await options.writeKey(), ...scope });
    await setValue(writer, container, value);
    written += 1;
  }
  log(`${written > 0 ? checkMark : tildeMark} Set ${written} of ${values} from ${path}`);
  return { changed: written > 0 };
}

/** Import a `.env` file into this environment's operator values, then start a blocked deploy again or offer a deploy. */
export async function runEnvImport(context: InfraContext): Promise<void> {
  let operator: OperatorKey | undefined;
  const operatorKey = async () => {
    operator ??= await acquireOperatorKey(context);
    return operator;
  };
  const reader = resolveOperatorIdentity().observer ?? (await operatorKey());
  const { changed } = await importEnvFile({
    readKey: reader.secretKey,
    writeKey: async () => (await operatorKey()).secretKey,
    projectId: context.projectId,
    region: context.appConfig.s3.region,
    mode: context.environment,
    prompts: { input, confirm },
  });
  await offerDeploy(context, operator, changed);
}
