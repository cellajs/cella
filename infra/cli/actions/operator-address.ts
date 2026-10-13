import { confirm, input } from '@inquirer/prompts';
import { parseAclInput } from '../../lib/db-exposure-acl';
import { deriveInfra } from '../../lib/naming';
import { actionCommand, actionLabel } from '../../lib/operator-actions';
import { resolveDnsProjectIds } from '../../lib/scaleway/dns-zone-project';
import { fetchAppRulesByName } from '../../lib/scaleway/iam-client';
import { ipAllowed } from '../../lib/scaleway/ip-lock';
import { resolveOperatorIdentity } from '../../lib/scaleway/operator-identity';
import { principalNames } from '../../lib/scaleway/principals';
import { setPolicyRules } from '../../lib/scaleway/scaleway-iam';
import { checkMark, crossMark, pc, warningMark } from '../../lib/utils/cli-output';
import { errorMessage } from '../../lib/utils/errors';
import { operatorRules } from '../../tasks/setup-operator-app';
import { forgetOperatorLock } from '../session';
import { endAction, type InfraContext } from '../shared';
import { acquireOperatorKey, operatorLock, publicAddress, readOperatorLock } from './operator-unlock';

/** Whether the policy, read back, names exactly the addresses that were set, on every rule. */
export function lockMatches(read: { cidrs: string[]; open: boolean }, wanted: readonly string[]): boolean {
  return !read.open && read.cidrs.length === wanted.length && wanted.every((cidr) => read.cidrs.includes(cidr));
}

/**
 * Change the addresses the operator key works from, with the operator key itself. The policy's rules are replaced in place, so the key keeps
 * its rights throughout, and the run has to come from an address the policy still names: a move away from an address that is already lost
 * takes the Owner API key (`operator-key`).
 */
export async function runOperatorAddress(context: InfraContext): Promise<void> {
  const { appConfig, projectId } = context;
  const mode = context.environment;
  const names = principalNames(appConfig.slug, mode);
  const lock = await operatorLock(context);
  if (lock.state === 'absent') {
    console.error(
      `${crossMark} This stack has no '${names.operator}' application yet. Create it with your Owner API key: \`${actionCommand('operator-key')}\`.`,
    );
    endAction(1);
  }
  console.info(pc.dim(`\n${actionLabel('operator-address')}: the addresses Scaleway accepts the key of '${names.operator}' from.\n`));
  if (lock.open)
    console.warn(
      `${warningMark} A rule of '${names.operator}-policy' carries no address condition, so the key works from every address. This run restores it.`,
    );
  else if (lock.cidrs.length > 0) console.info(`Now: ${pc.cyan(lock.cidrs.join(', '))}`);

  const address = await publicAddress();
  if (address) console.info(`This machine reaches the internet as ${pc.cyan(address)}.`);
  const raw = await input({
    message: 'Dedicated IPv4 address(es) the operator key works from, comma-separated',
    default: lock.cidrs.length > 0 ? lock.cidrs.join(', ') : address ? `${address}/32` : undefined,
    validate: (value) => {
      const parsed = parseAclInput(value);
      return parsed.ok || parsed.reason;
    },
  });
  const parsed = parseAclInput(raw);
  if (!parsed.ok) {
    console.error(`${crossMark} ${parsed.reason}`);
    endAction(1);
  }
  const { cidrs } = parsed;

  console.warn(`\n${pc.yellow(pc.bold('⚠  This changes where the operator key works.'))} From then on: ${pc.cyan(cidrs.join(', '))} only.`);
  if (address && !ipAllowed(address, cidrs)) {
    console.warn(`  ${warningMark} This machine's address is not in the new list: it loses access once Scaleway applies the change.`);
  }
  console.info(
    pc.dim(
      '  A wrong list locks the operator key out. The organization Owner then sets a new one: the operator key action with the Owner API key.\n',
    ),
  );
  if (!(await confirm({ message: `Change the dedicated IP for ${mode}?`, default: false }))) {
    console.info('Aborted; nothing changed.');
    return;
  }

  const key = await acquireOperatorKey(context);
  try {
    const dnsProjectIds = await resolveDnsProjectIds({ secretKey: key.secretKey }, deriveInfra(appConfig).dnsZone ?? '', projectId);
    await setPolicyRules({
      callerSecretKey: key.secretKey,
      organizationId: key.organizationId,
      policyName: `${names.operator}-policy`,
      rules: operatorRules({ projectId, organizationId: key.organizationId, dnsProjectIds, cidrs }),
    });
    forgetOperatorLock();

    // Read back with the admin application key when there is one: the operator key may already be refused from here.
    const reader = resolveOperatorIdentity().admin?.secretKey ?? key.secretKey;
    const rules = await fetchAppRulesByName({
      secretKey: reader,
      projectId,
      applicationName: names.operator,
      organizationId: key.organizationId,
    }).catch(() => null);
    if (rules && lockMatches(readOperatorLock(rules), cidrs)) {
      console.info(`${checkMark} '${names.operator}-policy' now names ${pc.cyan(cidrs.join(', '))} on every rule.`);
    } else {
      console.warn(
        `${warningMark} The change was sent, but the policy could not be read back to confirm it. Check '${names.operator}-policy' in the console.`,
      );
    }
    console.info(
      pc.dim('  Scaleway applies a policy change within a few minutes, one API after the other: until then an old address can still work.'),
    );
  } catch (error) {
    console.error(`${crossMark} The dedicated IP was not changed: ${errorMessage(error)}`);
    endAction(1);
  } finally {
    await key.release();
  }
}
