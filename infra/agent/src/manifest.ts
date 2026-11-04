import { request } from 'node:http';
import { isRecord } from '../../lib/utils/guards';

/** What the deploy tells the agent through the machine's user data: the role and release the machine was made for, and whether to drain. */
export interface Manifest {
  role: string;
  release: string;
  drain: boolean;
}

/** The metadata service, which serves user data only to a request from a source port below 1024: a higher port is answered 400. */
const METADATA_HOST = '169.254.42.42';

/** Parse the manifest; a malformed one is refused, and the agent keeps the state it had. */
function parseManifest(text: string): Manifest {
  const raw = JSON.parse(text) as unknown;
  if (!isRecord(raw) || typeof raw.role !== 'string' || typeof raw.release !== 'string' || typeof raw.drain !== 'boolean') {
    throw new Error('manifest: expected { role, release, drain }');
  }
  return { role: raw.role, release: raw.release, drain: raw.drain };
}

/** A source port below 1024, varied per request so a closed connection's port in TIME_WAIT is not taken again at once. */
const privilegedPort = () => 600 + Math.floor(Math.random() * 400);

/** Read the manifest from the metadata service, as root from a privileged source port, the one way it answers user data. */
export function readManifest(timeoutMs = 1500): Promise<Manifest> {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: METADATA_HOST, port: 80, path: '/user_data/manifest', method: 'GET', localPort: privilegedPort(), timeout: timeoutMs },
      (res) => {
        let body = '';
        res.setEncoding('utf-8');
        res.on('data', (chunk: string) => {
          body += chunk;
        });
        res.on('end', () => {
          if (res.statusCode !== 200) reject(new Error(`the manifest answered ${res.statusCode}`));
          else {
            try {
              resolve(parseManifest(body));
            } catch (error) {
              reject(error);
            }
          }
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('the manifest did not answer in time')));
    req.on('error', reject);
    req.end();
  });
}
