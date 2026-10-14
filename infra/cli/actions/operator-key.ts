import { confirm, input } from '@inquirer/prompts';
import { parseAclInput } from '../../lib/db-exposure-acl';
import { deriveInfra } from '../../lib/naming';
import { actionLabel } from '../../lib/operator-actions';
import { ipAllowed } from '../../lib/scaleway/ip-lock';
import { classifyPrincipal, describeKey } from '../../lib/scaleway/operator-identity';
import { appSlug, principalNames } from '../../lib/scaleway/principals';
import type { ScopedKeyResult } from '../../lib/scaleway/scaleway-iam';
import { projectsOfOtherModes } from '../../lib/stack/project-per-mode';
import { checkMark, crossMark, pc, warningMark, withSpinner } from '../../lib/utils/cli-output';
import { errorMessage } from '../../lib/utils/errors';
import { pollUntil } from '../../lib/utils/retry';
import { setupOperatorApp } from '../../tasks/setup-operator-app';
import { forgetOperatorLock } from '../session';
import { endAction, type InfraContext } from '../shared';
import { keyAccepted, publicAddress } from './operator-unlock';
import { acquireOwnerKey, printRevokeReminder } from './owner-key';

/** How long the new key is tried from this machine. Scaleway applies a policy within about a minute, and single APIs follow later still. */
const ACCEPT_ATTEMPTS = 24;
const ACCEPT_INTERVAL_MS = 5_000;

/**
 * What the check of the new key from this machine says. An address outside the list cannot check the key: Scaleway refuses it there by
 * design. An address inside the list either sees the key accepted, or reports that it is not yet.
 */
export function acceptanceVerdict(opts: { addressInList: boolean | undefined; accepted: boolean }): 'accepted' | 'not-yet' | 'cannot-check' {
  if (opts.addressInList === false) return 'cannot-check';
  return opts.accepted ? 'accepted' : 'not-yet';
}

/** Show the key once and hold until the operator confirms it is stored: nothing else keeps it, and Scaleway shows a secret key only at creation. */
async function confirmKeyStored(name: string, key: ScopedKeyResult): Promise<void> {
  console.info(`\n→ Operator key of '${name}' ${pc.dim('(shown once)')}\n`);
  console.info(`    access key  ${pc.cyanBright(key.accessKey)}`);
  console.info(`    secret key  ${pc.cyanBright(key.secretKey)}\n`);
  console.info(`  ${pc.bold('Store both in your password manager now.')} The CLI keeps them nowhere, and Scaleway cannot show the secret key again.`);
  while (!(await confirm({ message: 'Operator key stored in your password manager?', default: false }))) {
    console.warn(`${warningMark} Store it before continuing: this is the only time it is shown.`);
  }
}

/** The environments an operator key reaches: the one the action runs for, then every other environment that has a project on this machine. */
export function operatorReach(mode: string, projectId: string, others: ReadonlyMap<string, string>): Array<{ mode: string; projectId: string }> {
  return [{ mode, projectId }, ...[...others].filter(([id]) => id !== projectId).map(([id, other]) => ({ mode: other, projectId: id }))];
}

/**
 * Create the app's operator application and a fresh key for it: the principal a person runs privileged actions as, in every environment of
 * the app. Scaleway accepts the key from the dedicated address only, which an Owner API key can never be held to, and the key writes no IAM.
 * A run replaces the application's policy and every earlier key, so the caller is the organization Owner (or another IAMManager principal),
 * never the operator application itself. An environment set up later, or a new address, takes this action again.
 */
export async function runOperatorKey(context: InfraContext): Promise<void> {
  const { appConfig, projectId } = context;
  const mode = context.environment;
  const names = principalNames(appConfig.slug, mode);
  const reach = operatorReach(mode, projectId, projectsOfOtherModes(mode));
  console.info(
    pc.dim(
      `\n${actionLabel('operator-key')}: the '${names.operator}' application and a fresh key, which Scaleway accepts from your dedicated IP address only.\n`,
    ),
  );
  console.info(`The key works in ${reach.map((entry) => `${pc.cyan(entry.mode)} ${pc.dim(`(project ${entry.projectId})`)}`).join(' and ')}.`);
  console.info(pc.dim('  An environment is listed once its setup named a project on this machine (infra/.env.<mode>).\n'));

  const detected = await publicAddress();
  if (detected) console.info(`This machine reaches the internet as ${pc.cyan(detected)}.`);
  else console.warn(`${warningMark} Could not detect this machine's public address: enter the dedicated address yourself.`);

  const raw = await input({
    message: 'Dedicated IPv4 address(es) the operator key works from, comma-separated',
    default: detected ? `${detected}/32` : undefined,
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
  const addressInList = detected ? ipAllowed(detected, cidrs) : undefined;

  console.warn(
    `\n${pc.yellow(pc.bold('⚠  This replaces the operator key.'))} An earlier key of '${names.operator}' stops working, and the new one works from ${pc.cyan(cidrs.join(', '))} only.`,
  );
  if (addressInList === false)
    console.warn(`  ${warningMark} This machine's address is not in that list: the new key can be neither checked nor used from here.`);
  console.info(pc.dim('  When the address changes, the organization Owner sets the new one: this action again, or the policy in the console.\n'));
  if (!(await confirm({ message: `Create the operator key of ${appSlug(appConfig.slug, mode)}?`, default: false }))) {
    console.info('Aborted; nothing changed.');
    return;
  }

  const ownerKey = await acquireOwnerKey({ names, projectId, slug: appConfig.slug, mode });
  try {
    // The run deletes the operator policy before it writes the new one, so the operator application's own key would lose its rights in between.
    const bearer = await describeKey(ownerKey).catch(() => undefined);
    if (bearer && classifyPrincipal(bearer, names) === 'operator') {
      console.error(
        `${crossMark} This action replaces the policy of '${names.operator}', so that application's own key cannot run it. Use your Owner API key.`,
      );
      endAction(1);
    }

    let key: ScopedKeyResult;
    try {
      key = await setupOperatorApp({
        callerSecretKey: ownerKey.secretKey,
        organizationId: ownerKey.organizationId,
        projectId,
        projectIds: reach.map((entry) => entry.projectId),
        slug: appSlug(appConfig.slug, mode),
        dnsZone: deriveInfra(appConfig).dnsZone,
        cidrs,
      });
    } catch (error) {
      console.error(`${crossMark} The operator key was not created: ${errorMessage(error)}`);
      endAction(1);
    }

    forgetOperatorLock();
    await confirmKeyStored(names.operator, key);

    const accepted =
      addressInList === false
        ? false
        : Boolean(
            await withSpinner('Waiting for Scaleway to accept the new key from this address', () =>
              pollUntil(() => keyAccepted(key.secretKey, key.organizationId), { attempts: ACCEPT_ATTEMPTS, intervalMs: ACCEPT_INTERVAL_MS }),
            ),
          );
    const verdict = acceptanceVerdict({ addressInList, accepted });
    if (verdict === 'accepted') {
      console.info(`${checkMark} Scaleway accepts the operator key from this address. ${pc.dim('Single APIs can follow a minute or two later.')}`);
    } else if (verdict === 'not-yet') {
      console.warn(
        `${warningMark} Scaleway does not accept the operator key from this address yet. A new policy can take a few minutes; if it stays refused, check the address list of '${names.operator}-policy' in the console.`,
      );
    } else {
      console.info(pc.dim('Not checked from here: this address is outside the list. Use the key from the dedicated address.'));
    }
    console.info(
      `\n  ${pc.bold('From now on the CLI asks for its secret key, once per session.')} ${pc.dim('From another address Scaleway refuses it.')}`,
    );
  } finally {
    await ownerKey.release();
  }
  if (ownerKey.pasted) printRevokeReminder();
}
