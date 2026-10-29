import { spawnSync } from 'node:child_process';
import { gitKeyOptions } from '../../lib/deploy/git-remote';
import { REPOSITORY_KEY_NAME, repositoryUrl } from '../../lib/deploy/repository-key';
import { actionCommand, actionLabel } from '../../lib/operator-actions';
import { RUNNER_FILE, readRunner } from '../../lib/runner/runner-file';
import { runnerReadKey } from '../../lib/runner/runner-machine';
import { createSecretManagerClient } from '../../lib/scaleway/scaleway-secret-manager';
import { DEPLOY_FOLDER } from '../../lib/scaleway/secret-paths';
import { checkMark, crossMark, pc } from '../../lib/utils/cli-output';
import { maskedSecret } from '../prompts/masked-secret';
import { confirmOrDefault, endAction, type InfraContext } from '../shared';
import { acquirePrivilegedKey } from './operator-unlock';
import { organizationRunner, runnerCommand, runnerOperatorKey } from './runner';

/** One stored copy of the key: the project's Secret Manager, the secret's name and folder, and who fetches with it. */
interface KeyCopy {
  secrets: ReturnType<typeof createSecretManagerClient>;
  name: string;
  path: string;
  reader: string;
}

/** Ask for the key, then store it in every copy once the repository answers to it; an empty answer removes the stored copies. */
async function storeRepositoryKey(repository: string, copies: readonly KeyCopy[], note: string): Promise<void> {
  const stored = await Promise.all(copies.map((copy) => copy.secrets.getSecretByName(copy.name, copy.path)));
  const readers = copies.map((copy) => copy.reader).join(' and ');
  const key = (await maskedSecret({ message: `Repository read key${stored.some(Boolean) ? pc.dim(' (empty removes the stored key)') : ''}` })).trim();
  if (!key) {
    if (!stored.some(Boolean)) return console.info('No key given; nothing stored.');
    if (!(await confirmOrDefault({ message: `Remove the read key of ${repository} for ${readers}?`, default: false }))) return;
    for (const [index, secret] of stored.entries()) if (secret) await copies[index]?.secrets.deleteSecret(secret.id);
    console.info(`${checkMark} Removed for ${readers}: a fetch goes without a key.${note}`);
    return;
  }

  const answer = spawnSync('git', [...gitKeyOptions(key), 'ls-remote', repository, 'HEAD'], {
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  if (answer.status !== 0) {
    console.error(`${crossMark} ${repository} did not answer to that key, so it is not stored: ${answer.stderr.trim().split('\n').at(-1) ?? ''}`);
    return endAction(1);
  }
  for (const [index, copy] of copies.entries()) {
    const container =
      stored[index] ??
      (await copy.secrets.ensureSecret({
        name: copy.name,
        path: copy.path,
        description: `Read-only key of ${repository}, for ${copy.reader} (D19, D22)`,
      }));
    await copy.secrets.putSecretValue({ secretId: container.id, value: key, description: 'Set by the operator', disablePrevious: true });
  }
  console.info(`${checkMark} Stored for ${readers}.${note}`);
}

/**
 * Store, replace or remove the read-only key a private repository is fetched with (D19), in the deploy folder of this environment's
 * project, on the operator key. The deploy hands it to the builder in its read-once bundle. Where the app's own runner is set up, its project
 * keeps a copy (D22), which Replace the runner gives to the runner machine. With `--runner-file` of an organization's runner, it stores that
 * runner's copy alone, on its operator's key, as the app's operator reaches no runner (Q1, Q6). A key the repository does not answer is not
 * stored. An empty answer removes a stored key, for a repository anyone may read.
 */
export async function runRepositoryKey(context: InfraContext): Promise<void> {
  const { appConfig, projectId } = context;
  const region = appConfig.s3.region;
  const repository = repositoryUrl();
  const intro = (where: string) =>
    console.info(
      pc.dim(
        `\n${actionLabel('repository-key')}: the key ${where}.\n` +
          '  Make a fine-grained GitHub token for this repository only, with "Contents: read" and nothing else, and an expiry.\n',
      ),
    );

  const organization = organizationRunner(appConfig.appSlug);
  if (organization) {
    intro(`'${organization.name}' fetches ${repository} with, in its project`);
    const operator = await runnerOperatorKey(context, organization);
    const secrets = createSecretManagerClient({ secretKey: operator.secretKey, region, projectId: organization.file.projectId });
    const copy = { secrets, ...runnerReadKey(repository, true), reader: `'${organization.name}'` };
    return storeRepositoryKey(repository, [copy], ` \`${runnerCommand('runner-replace', organization)}\` gives the runner machine the change.`);
  }

  const runner = readRunner(appConfig.appSlug, RUNNER_FILE);
  intro(`the builder fetches a release's commit of ${repository} with, in ${DEPLOY_FOLDER} of ${context.environment}`);
  const operator = await acquirePrivilegedKey(context);
  const client = (inProject: string) => createSecretManagerClient({ secretKey: operator.secretKey, region, projectId: inProject });
  const copies: KeyCopy[] = [{ secrets: client(projectId), name: REPOSITORY_KEY_NAME, path: DEPLOY_FOLDER, reader: 'the builder' }];
  if (runner.file) copies.push({ secrets: client(runner.file.projectId), ...runnerReadKey(repository, false), reader: 'the runner' });
  const note = runner.organization
    ? ` '${runner.name}' fetches with its own copy: \`${actionCommand('repository-key')} --runner-file <its file>\`, on the key of '${runner.name}-operator'.`
    : runner.file
      ? ` \`${actionCommand('runner-replace')}\` gives the runner machine the change.`
      : '';
  return storeRepositoryKey(repository, copies, note);
}
