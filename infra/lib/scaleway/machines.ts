import { resolveFetch } from '../utils/fetch-like';
import { type ScwAuth, scwErrorStatus, scwFetch, scwSend } from './scw-fetch';

/** A machine as the Instance API returns it. */
export interface ScwServer {
  id: string;
  name: string;
  state: string;
  tags?: string[];
  volumes?: Record<string, { id: string; volume_type?: string }>;
}

const instanceApi = (zone: string) => `https://api.scaleway.com/instance/v1/zones/${zone}`;
const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

/** What a deploy makes a machine of. */
export interface MachineSpec {
  name: string;
  /** The commercial type, such as `DEV1-S`. */
  type: string;
  /** A marketplace label, such as `docker`, or an image id. */
  image: string;
  projectId: string;
  securityGroupId: string;
  tags: readonly string[];
  /** Size of the Block Storage root volume. */
  volumeBytes: number;
  /** User data by key, written before the first power-on: `cloud-init` for cloud-init, any other for the machine's own programs to read. */
  userData: Readonly<Record<string, string>>;
  /** The private NIC: the network, and the reserved IPAM address it takes; without one, the network's DHCP picks an address. */
  privateNic?: { privateNetworkId: string; ipamIpId?: string };
}

/** Write one key of a machine's user data; the metadata service serves it to the machine within about a second (M3). */
export async function setUserData(auth: ScwAuth, zone: string, serverId: string, key: string, text: string): Promise<void> {
  const res = await resolveFetch(auth.fetchImpl)(`${instanceApi(zone)}/servers/${serverId}/user_data/${key}`, {
    method: 'PATCH',
    headers: { 'X-Auth-Token': auth.secretKey, 'Content-Type': 'text/plain' },
    body: text,
  });
  if (!res.ok) throw new Error(`setting the user data '${key}' of ${serverId} → ${res.status}: ${await res.text()}`);
}

/** Read one key of a machine's user data. */
export async function getUserData(auth: ScwAuth, zone: string, serverId: string, key: string): Promise<string> {
  const res = await resolveFetch(auth.fetchImpl)(`${instanceApi(zone)}/servers/${serverId}/user_data/${key}`, {
    method: 'GET',
    headers: { 'X-Auth-Token': auth.secretKey },
  });
  if (!res.ok) throw new Error(`reading the user data '${key}' of ${serverId} → ${res.status}`);
  return res.text();
}

/**
 * Make a machine and power it on: the server with a public address for egress (its security group drops every inbound packet but what it
 * admits), its user data, then its private NIC, at a reserved address when one is given, all before the first boot. A failure after the
 * server exists deletes it before it is thrown, so no half-made machine keeps an address.
 */
export async function createMachine(auth: ScwAuth, zone: string, spec: MachineSpec): Promise<ScwServer> {
  const { server } = await scwFetch<{ server: ScwServer }>(auth, 'POST', `${instanceApi(zone)}/servers`, {
    name: spec.name,
    commercial_type: spec.type,
    image: spec.image,
    project: spec.projectId,
    dynamic_ip_required: true,
    security_group: spec.securityGroupId,
    tags: [...spec.tags],
    volumes: { 0: { size: spec.volumeBytes, volume_type: 'sbs_volume' } },
  });
  try {
    for (const [key, text] of Object.entries(spec.userData)) await setUserData(auth, zone, server.id, key, text);
    if (spec.privateNic) {
      await scwSend(auth, 'POST', `${instanceApi(zone)}/servers/${server.id}/private_nics`, {
        private_network_id: spec.privateNic.privateNetworkId,
        ...(spec.privateNic.ipamIpId ? { ipam_ip_ids: [spec.privateNic.ipamIpId] } : {}),
      });
    }
    await scwSend(auth, 'POST', `${instanceApi(zone)}/servers/${server.id}/action`, { action: 'poweron' });
  } catch (error) {
    // A half-made machine would hold its slot's address: it goes before the failure is reported.
    await deleteMachine(auth, zone, server.id).catch(() => undefined);
    throw error;
  }
  return server;
}

/** The project's machines in a zone whose name starts with `prefix`. */
export async function listMachines(auth: ScwAuth, opts: { zone: string; projectId: string; prefix: string }): Promise<ScwServer[]> {
  const { servers } = await scwFetch<{ servers: ScwServer[] }>(
    auth,
    'GET',
    `${instanceApi(opts.zone)}/servers?project=${opts.projectId}&name=${encodeURIComponent(opts.prefix)}&per_page=100`,
  );
  return servers.filter((server) => server.name.startsWith(opts.prefix));
}

/** One machine, or undefined once it is gone. */
async function readMachine(auth: ScwAuth, zone: string, serverId: string): Promise<ScwServer | undefined> {
  try {
    return (await scwFetch<{ server: ScwServer }>(auth, 'GET', `${instanceApi(zone)}/servers/${serverId}`)).server;
  } catch (error) {
    if (scwErrorStatus(error) === 404) return undefined;
    throw error;
  }
}

/**
 * Delete a machine: power it off (a shutdown, so its containers get their stop signal), delete it, then the Block Storage root volume it
 * leaves behind, once detached. A machine already gone is deleted as asked.
 */
export async function deleteMachine(auth: ScwAuth, zone: string, serverId: string): Promise<void> {
  const server = await readMachine(auth, zone, serverId);
  if (!server) return;
  if (server.state !== 'stopped') {
    const powerOff = () => scwSend(auth, 'POST', `${instanceApi(zone)}/servers/${server.id}/action`, { action: 'poweroff' }).catch(() => undefined);
    await powerOff();
    for (let tries = 0; tries < 40; tries++) {
      const now = await readMachine(auth, zone, server.id);
      if (!now || now.state === 'stopped') break;
      // A builder halts itself when it is done, into 'stopped in place', where a poweroff sent during that shutdown leaves it: send it again.
      if (now.state === 'stopped in place') await powerOff();
      await sleep(5_000);
    }
  }
  await scwSend(auth, 'DELETE', `${instanceApi(zone)}/servers/${server.id}`);
  for (const volume of Object.values(server.volumes ?? {})) {
    for (let tries = 0; tries < 12; tries++) {
      const done = await scwSend(auth, 'DELETE', `https://api.scaleway.com/block/v1/zones/${zone}/volumes/${volume.id}`).then(
        () => true,
        () => false,
      );
      if (done) break;
      await sleep(5_000);
    }
  }
}

/**
 * Delete every machine of a project whose name starts with `prefix`, with its root volume: builders, before and after a build and at a
 * teardown, and the runner, when it is replaced. Returns the names deleted.
 */
export async function removeMachines(opts: { secretKey: string; projectId: string; zone: string; prefix: string }): Promise<string[]> {
  const auth = { secretKey: opts.secretKey };
  const removed: string[] = [];
  for (const server of await listMachines(auth, opts)) {
    await deleteMachine(auth, opts.zone, server.id);
    removed.push(server.name);
  }
  return removed;
}
