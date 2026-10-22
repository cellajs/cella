import { appConfig } from 'shared';

/** One DNS label of letters, digits and inner hyphens. */
const ldhLabel = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/** A `pushServiceHosts` entry as compared: lowercase, without one trailing dot. */
const normaliseHost = (host: string) => host.toLowerCase().replace(/\.$/, '');

/**
 * Whether `endpoint` is an https URL on a host in `appConfig.pushServiceHosts`, on the default port. web-push connects
 * to the host Node's legacy `url.parse` reads, which ends at characters the WHATWG parser keeps (`;`, `%`, quotes), so
 * the endpoint must also be canonical and its host plain labels: then both parsers name the host that was checked.
 */
export function isPushServiceEndpoint(endpoint: string): boolean {
  const url = URL.parse(endpoint);
  if (url?.protocol !== 'https:' || url.port !== '' || url.href !== endpoint) return false;
  const { hostname } = url;
  if (!hostname.split('.').every((label) => ldhLabel.test(label))) return false;
  return appConfig.pushServiceHosts.map(normaliseHost).some((host) => (host.startsWith('*.') ? hostname.endsWith(host.slice(1)) : hostname === host));
}
