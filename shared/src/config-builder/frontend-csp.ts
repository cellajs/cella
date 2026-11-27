import { appConfig } from './app-config.ts';

type BuiltConfig = typeof appConfig;

/**
 * Who may frame a document under `/embed/`: the LTI platforms `ltiFrameAncestors` names, nobody while it names none.
 * @throws when an entry is no bare origin: a path or a `;` would change the policy.
 */
export function embedFrameAncestors(config: BuiltConfig): string {
  for (const entry of config.ltiFrameAncestors) {
    if (URL.parse(entry)?.origin !== entry) throw new Error(`frontend-csp: ltiFrameAncestors entry '${entry}' is not an origin`);
  }
  return config.ltiFrameAncestors.join(' ') || "'none'";
}

/**
 * The frontend's Content-Security-Policy for one environment's config: the app origin, the services off it, the buckets,
 * the map styles and the monitoring DSN. A document under `/embed/` passes `embedFrameAncestors`; every other one is
 * framed by the app alone.
 */
export function frontendCsp(config: BuiltConfig, frameAncestors = "'self'"): string {
  const isEnabled = (slug: 'yjs' | 'mcp'): boolean => config.services[slug].enabled !== false;
  const servicePublicUrl = (slug: 'backend' | 'yjs' | 'mcp'): string => {
    const url = config.services[slug].publicUrl;
    if (!url) throw new Error(`frontend-csp: service '${slug}' has no publicUrl in appConfig.services`);
    return url;
  };

  // Same-origin services collapse into connect-src 'self'.
  const appOrigin = new URL(config.frontendUrl).origin;
  const originUnlessSelf = (url: string): string => {
    // ws(s):// normalizes to http(s) for the comparison; WebSocket URLs on the app origin are covered by 'self'.
    const origin = new URL(url.replace(/^ws/, 'http')).origin;
    return origin === appOrigin ? '' : new URL(url).origin;
  };

  const cspOrigins = {
    api: originUnlessSelf(servicePublicUrl('backend')),
    yjs: isEnabled('yjs') ? originUnlessSelf(servicePublicUrl('yjs')).replace(/^http/, 'ws') : '',
    mcp: isEnabled('mcp') ? originUnlessSelf(servicePublicUrl('mcp')) : '',
    s3Host: config.s3.host ? `https://${config.s3.host}` : '',
    s3Buckets: config.s3.host ? `https://*.${config.s3.host}` : '',
    s3Public: config.s3.publicCDNUrl,
    s3Private: config.s3.privateCDNUrl,
    // The browser posts its error and session reports to the DSN's origin.
    monitoring: config.monitoring?.dsn ? originUnlessSelf(config.monitoring.dsn) : '',
    // The contact map fetches its style, tiles, fonts and icons from each style URL's origin.
    maps: [
      ...new Set(
        Object.values(config.mapStyleUrls ?? {})
          .filter(Boolean)
          .map((url) => new URL(url).origin),
      ),
    ].join(' '),
  };

  const connectSrc = [
    `connect-src 'self' blob:`,
    cspOrigins.api,
    cspOrigins.yjs,
    cspOrigins.mcp,
    cspOrigins.s3Host,
    cspOrigins.s3Buckets,
    cspOrigins.s3Public,
    cspOrigins.s3Private,
    cspOrigins.maps,
    cspOrigins.monitoring,
    'https://*.transloadit.com',
    'wss://*.transloadit.com',
    'https://transloaditstatus.com',
    '*.gleap.io',
    'wss://ws.gleap.io',
  ]
    .filter(Boolean)
    .join(' ');

  return [
    `default-src 'self'`,
    `script-src 'self' *.gleap.io`,
    `worker-src 'self' blob:`,
    `style-src 'self' 'unsafe-inline'`,
    connectSrc,
    `img-src 'self' blob: https: data:`,
    `media-src 'self' blob: data: https://i.ytimg.com *.gleap.io ${cspOrigins.s3Buckets} ${cspOrigins.s3Public} ${cspOrigins.s3Private}`,
    // As an LTI platform the app frames the LTI tools its tenants install, from whatever HTTPS origin they registered.
    `frame-src 'self' *.youtube.com *.vimeo.com *.gleap.io${config.has.ltiPlatform ? ' https:' : ''}`,
    `font-src 'self' data:`,
    `frame-ancestors ${frameAncestors}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ]
    .join('; ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The frontend's Permissions-Policy: a page of the app may use the camera and microphone (the uploader), and none asks for a location. */
export const frontendPermissionsPolicy = 'camera=(self), microphone=(self), geolocation=()';

/** The proxy's three header values for the config `APP_MODE` names: the engine reads them through `infra/description.yml`. */
export const frontendHeaders = {
  csp: frontendCsp(appConfig),
  embedCsp: frontendCsp(appConfig, embedFrameAncestors(appConfig)),
  permissionsPolicy: frontendPermissionsPolicy,
};
