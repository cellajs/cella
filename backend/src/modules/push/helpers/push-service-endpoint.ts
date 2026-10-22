import { appConfig } from 'shared';

/** Whether `endpoint` is an https URL on a host in `appConfig.pushServiceHosts`, on the default port. */
export function isPushServiceEndpoint(endpoint: string): boolean {
  const url = URL.parse(endpoint);
  if (url?.protocol !== 'https:' || url.port !== '') return false;
  const { hostname } = url;
  return appConfig.pushServiceHosts.some((host) => (host.startsWith('*.') ? hostname.endsWith(host.slice(1)) : hostname === host));
}
