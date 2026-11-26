import { appConfig } from '../config-builder/app-config.ts';

/** A port written at the end of a URL's authority. `URL` drops a scheme's default one, such as `:80` of `http`. */
const writtenPort = /^[^/]*\/\/[^/?#]*:\d+(?:[/?#]|$)/;

/**
 * `dsn` on `origin`'s scheme, host and port when it names `localhost` and no port, which means the app itself; its key
 * (the URL's user name) and path are kept. A DSN with a port, one on another host, an empty one and a text that is no URL
 * are returned as written.
 */
export const dsnOnOrigin = (dsn: string, origin: string): string => {
  const url = URL.parse(dsn);
  if (url?.hostname !== 'localhost' || writtenPort.test(dsn)) return dsn;
  const own = new URL(origin);
  url.protocol = own.protocol;
  url.host = own.host;
  return url.href;
};

/**
 * The DSN this mode's config names. On a stack of this machine a portless `localhost` DSN takes the app's origin, which
 * `devAppIndex`, the dev port offset and a tunnel move; a deployed mode's DSN is used as written.
 */
export const monitoringDsn = appConfig.isLocal ? dsnOnOrigin(appConfig.monitoring.dsn, appConfig.frontendUrl) : appConfig.monitoring.dsn;
