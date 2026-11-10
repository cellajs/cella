import { spawnSync } from 'node:child_process';
import { gitKeyOptions } from '../../lib/deploy/git-remote';
import { REPOSITORY_KEY_NAME, repositoryUrl } from '../../lib/deploy/repository-key';
import { actionLabel } from '../../lib/operator-actions';
import { createSecretManagerClient } from '../../lib/scaleway/scaleway-secret-manager';
import { RUNTIME_FOLDER } from '../../lib/scaleway/secret-paths';
import { checkMark, crossMark, pc } from '../../lib/utils/cli-output';
import { maskedSecret } from '../prompts/masked-secret';
import { confirmOrDefault, endAction, type InfraContext } from '../shared';
import { acquireOperatorKey } from './operator-unlock';

/**
 * Store, replace or remove the read-only key a private repository is fetched with, in the runtime folder of this environment's
 * project, on the operator key. A scheduled run reads the environments file and the release tags with it, and the deploy writes it into the
 * builder's cloud-init. A key the repository does not answer is not stored. An empty answer removes a stored key, for a repository anyone
 * may read.
 */
export async function runRepositoryKey(context: InfraContext): Promise<void> {
  const { appConfig, projectId } = context;
  const repository = repositoryUrl();
  console.info(
    pc.dim(
      `\n${actionLabel('repository-key')}: lets a deploy fetch a private repository.\n` +
        '  Make a fine-grained GitHub token for this repository only, with "Contents: read" and nothing else, and an expiry.\n',
    ),
  );
  const operator = await acquireOperatorKey(context);
  const secrets = createSecretManagerClient({ secretKey: operator.secretKey, region: appConfig.s3.region, projectId });
  const stored = await secrets.getSecretByName(REPOSITORY_KEY_NAME, RUNTIME_FOLDER);

  const key = (await maskedSecret({ message: `Repository read key${stored ? pc.dim(' (empty removes the stored key)') : ''}` })).trim();
  if (!key) {
    if (!stored) return console.info('No key given; nothing stored.');
    if (!(await confirmOrDefault({ message: `Remove the repository read key of ${context.environment}?`, default: false }))) return;
    await secrets.deleteSecret(stored.id);
    console.info(`${checkMark} Removed: ${context.environment} fetches without a key.`);
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
  const container =
    stored ??
    (await secrets.ensureSecret({
      name: REPOSITORY_KEY_NAME,
      path: RUNTIME_FOLDER,
      description: "Read-only key of the app's repository, for the builder",
    }));
  await secrets.putSecretValue({ secretId: container.id, value: key, description: 'Set by the operator', disablePrevious: true });
  console.info(`${checkMark} Stored: the next scheduled run and build of ${context.environment} fetch with it.`);
}
