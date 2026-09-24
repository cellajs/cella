import { checkMark, pc } from '../../lib/utils/cli-output';
import { keychainReference, modeEnvPath, storeInKeychain, writeModeEnvValues } from '../../lib/utils/env-files';
import { type InfraContext, resolveVerifiedPassphrase } from '../shared';

/**
 * Move the Pulumi passphrase out of infra/.env.<mode> into the OS keychain: the file keeps a `keychain:` reference the env loader resolves on every
 * run, so nothing plaintext sits in the repo directory. The password-manager copy stays the durable one; this is the working copy.
 */
export async function runStorePassphrase(context: InfraContext): Promise<void> {
  const service = `${context.appConfig.slug}-${context.environment}`;
  const account = 'PULUMI_CONFIG_PASSPHRASE';
  console.info(
    pc.dim(
      `\nStore passphrase in keychain: keychain entry ${service}/${account}; infra/.env.${context.environment} keeps only the reference.\n`,
    ),
  );
  const passphrase = await resolveVerifiedPassphrase(context.stackYaml);
  storeInKeychain(service, account, passphrase);
  writeModeEnvValues(context.environment, { PULUMI_CONFIG_PASSPHRASE: keychainReference(service, account) });
  console.info(
    `${checkMark} stored in the keychain; ${modeEnvPath(context.environment)} now holds ${keychainReference(service, account)}`,
  );
  console.info(
    pc.dim("  Keep the password-manager copy: the keychain entry is this machine's working copy, not a backup."),
  );
}
