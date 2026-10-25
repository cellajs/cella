import { spawnSync } from 'node:child_process';
import { gitKeyOptions } from '../../lib/deploy/git-remote';
import { REPOSITORY_KEY_NAME, repositoryUrl } from '../../lib/deploy/repository-key';
import { actionLabel } from '../../lib/operator-actions';
import { createSecretManagerClient } from '../../lib/scaleway/scaleway-secret-manager';
import { deployFolderPath } from '../../lib/scaleway/secret-paths';
import { checkMark, crossMark, pc } from '../../lib/utils/cli-output';
import { maskedSecret } from '../prompts/masked-secret';
import { confirmOrDefault, endAction, type InfraContext } from '../shared';
import { acquirePrivilegedKey } from './operator-unlock';

/**
 * Store, replace or remove the read-only key a private repository is fetched with (D19), in the deploy folder of this environment's
 * project, on the operator key. The deploy hands it to the builder in its read-once bundle; nothing else reads it. A key the repository does
 * not answer is not stored. An empty answer removes a stored key, for a repository anyone may read.
 */
export async function runRepositoryKey(context: InfraContext): Promise<void> {
  const { appConfig, projectId } = context;
  const repository = repositoryUrl();
  const path = deployFolderPath(appConfig.slug, context.environment);
  console.info(
    pc.dim(
      `\n${actionLabel('repository-key')}: the key the builder fetches a release's commit of ${repository} with, in ${path} of ${context.environment}.\n` +
        '  Make a fine-grained GitHub token for this repository only, with "Contents: read" and nothing else, and an expiry.\n',
    ),
  );
  const operator = await acquirePrivilegedKey(context);
  const secrets = createSecretManagerClient({ secretKey: operator.secretKey, region: appConfig.s3.region, projectId });
  const stored = await secrets.getSecretByName(REPOSITORY_KEY_NAME, path);

  const key = (await maskedSecret({ message: `Repository read key${stored ? pc.dim(' (empty removes the stored key)') : ''}` })).trim();
  if (!key) {
    if (!stored) return console.info('No key given; nothing stored.');
    if (!(await confirmOrDefault({ message: `Remove the repository read key of ${context.environment}?`, default: false }))) return;
    await secrets.deleteSecret(stored.id);
    console.info(`${checkMark} Removed: the builder of ${context.environment} fetches without a key.`);
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
    (await secrets.ensureSecret({ name: REPOSITORY_KEY_NAME, path, description: "Read-only key of the app's repository, for the builder (D19)" }));
  await secrets.putSecretValue({ secretId: container.id, value: key, description: 'Set by the operator', disablePrevious: true });
  console.info(`${checkMark} Stored: the next build of ${context.environment} fetches with it.`);
}
