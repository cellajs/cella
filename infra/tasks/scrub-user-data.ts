import { bucketBootAccountReader, releaseAccounts } from '../lib/deploy/boot-accounts';
import { deriveInfra } from '../lib/naming';
import { deployS3Key, makeS3Client, projectAccessKey } from '../lib/scaleway/s3-client';
import { scwFetch } from '../lib/scaleway/scw-fetch';
import { deployedServices } from '../lib/services';
import { runIfMain } from '../lib/utils/is-main';
import { withoutKeyFiles } from '../resources/cloud-init';
import { getFlag } from './args';

/** A machine as the scrub reads it from the Instance API. */
interface Machine {
  id: string;
  name: string;
  creation_date?: string;
}

/** The time a boot account names in its key, `<service>-YYYYMMDDThhmmssZ-boot.log`. */
function accountTime(key: string): number | undefined {
  const at = /-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?-boot\.log$/.exec(key);
  return at ? Date.UTC(+at[1]!, +at[2]! - 1, +at[3]!, +at[4]!, +at[5]!, +at[6]!) : undefined;
}

/**
 * True when the machine's first boot has run: its service's newest boot account of the release was written after the machine was made. Every
 * machine left after the reap runs this release, as a generation is named by the release it runs. A machine without such an account may still
 * be reading its user data.
 */
function booted(machine: Machine, accounts: ReadonlyArray<{ service: string; key?: string }>, slug: string): boolean {
  // The longest service name that prefixes the machine's, so a service named like the start of another is never taken for it.
  const account = accounts
    .filter((candidate) => machine.name.startsWith(`${slug}-${candidate.service}-`))
    .sort((a, b) => b.service.length - a.service.length)[0];
  const reported = account?.key ? accountTime(account.key) : undefined;
  // Account keys carry whole seconds.
  const made = Math.floor(Date.parse(machine.creation_date ?? '') / 1000) * 1000;
  return reported !== undefined && Number.isFinite(made) && reported >= made;
}

/**
 * Take the key files out of the user data of every machine of this environment that booted (D-e, first part), on the deploy key. Cloud-init
 * ran the script at the machine's first boot and the boot unit reads the key from disk at every boot, while the Instance API serves user data
 * to every key that reads machines, the deploy key's among them. A builder is left alone: the deploy deletes it.
 */
export async function main(argv = process.argv.slice(2)): Promise<void> {
  const secretKey = process.env.SCW_SECRET_KEY;
  const sha = getFlag(argv, '--sha');
  const projectId = getFlag(argv, '--project-id');
  if (!secretKey || !sha || !projectId) throw new Error('Required: SCW_SECRET_KEY, --sha, --project-id');
  const { loadEngineConfig } = await import('../config/engine-config');
  const appConfig = await loadEngineConfig();
  const { naming, region, zone } = deriveInfra(appConfig);
  const auth = { secretKey };
  const instance = `https://api.scaleway.com/instance/v1/zones/${zone}`;

  const services = deployedServices(appConfig.services, appConfig.singleVM).map((service) => service.slug);
  const { accessKey } = deployS3Key();
  const s3 = await makeS3Client(region, projectAccessKey(accessKey, projectId), secretKey);
  const accounts = await releaseAccounts(bucketBootAccountReader(s3, naming.bootDiagBucket), services, sha);
  const { servers = [] } = await scwFetch<{ servers?: Machine[] }>(
    auth,
    'GET',
    `${instance}/servers?project=${projectId}&name=${encodeURIComponent(`${naming.slug}-`)}&per_page=100`,
  );
  const reported = accounts.map(({ service, account }) => ({ service, key: account?.key }));
  const ours = servers.filter((server) => services.some((service) => server.name.startsWith(`${naming.slug}-${service}-`)));
  for (const machine of ours) {
    if (!booted(machine, reported, naming.slug)) {
      console.info(`[scrub] ${machine.name}: no boot account of this release yet, its user data stays`);
      continue;
    }
    const url = `${instance}/servers/${machine.id}/user_data/cloud-init`;
    const read = await fetch(url, { headers: { 'X-Auth-Token': secretKey } });
    if (read.status === 404) continue;
    if (!read.ok) throw new Error(`reading the cloud-init of ${machine.name} → ${read.status}: ${await read.text()}`);
    const scrubbed = withoutKeyFiles(await read.text());
    if (!scrubbed) continue;
    const write = await fetch(url, { method: 'PATCH', headers: { 'X-Auth-Token': secretKey, 'Content-Type': 'text/plain' }, body: scrubbed });
    if (!write.ok) throw new Error(`rewriting the cloud-init of ${machine.name} → ${write.status}: ${await write.text()}`);
    console.info(`[scrub] ${machine.name}: its key files left its user data`);
  }
}

runIfMain(import.meta.url, main);
