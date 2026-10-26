import { scwFetch, scwSend } from './scw-fetch';

/** A machine as the Instance API returns it. */
export interface ScwServer {
  id: string;
  name: string;
  state: string;
  volumes?: Record<string, { id: string; volume_type?: string }>;
}

/**
 * Delete every machine of a project whose name starts with `prefix`, and the Block Storage root volume each leaves behind: the machines no
 * Pulumi program knows (builders, before and after a build and at a teardown; the runner, when it is replaced). Returns the names deleted.
 */
export async function removeMachines(opts: { secretKey: string; projectId: string; zone: string; prefix: string }): Promise<string[]> {
  const auth = { secretKey: opts.secretKey };
  const instance = `https://api.scaleway.com/instance/v1/zones/${opts.zone}`;
  const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));
  const { servers } = await scwFetch<{ servers: ScwServer[] }>(
    auth,
    'GET',
    `${instance}/servers?project=${opts.projectId}&name=${encodeURIComponent(opts.prefix)}&per_page=50`,
  );
  const removed: string[] = [];
  for (const server of servers.filter((candidate) => candidate.name.startsWith(opts.prefix))) {
    if (server.state !== 'stopped') {
      const powerOff = () => scwSend(auth, 'POST', `${instance}/servers/${server.id}/action`, { action: 'poweroff' }).catch(() => undefined);
      await powerOff();
      for (let tries = 0; tries < 40; tries++) {
        const { server: now } = await scwFetch<{ server: ScwServer }>(auth, 'GET', `${instance}/servers/${server.id}`);
        if (now.state === 'stopped') break;
        // A builder halts itself when it is done, into 'stopped in place', where a poweroff sent during that shutdown leaves it: send it again.
        if (now.state === 'stopped in place') await powerOff();
        await sleep(5_000);
      }
    }
    await scwSend(auth, 'DELETE', `${instance}/servers/${server.id}`);
    // Its Block Storage root volume outlives the server; it is deleted once it is detached.
    for (const volume of Object.values(server.volumes ?? {})) {
      for (let tries = 0; tries < 12; tries++) {
        const done = await scwSend(auth, 'DELETE', `https://api.scaleway.com/block/v1/zones/${opts.zone}/volumes/${volume.id}`).then(
          () => true,
          () => false,
        );
        if (done) break;
        await sleep(5_000);
      }
    }
    removed.push(server.name);
  }
  return removed;
}
