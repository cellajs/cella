import type { EngineConfig } from '@cellajs/cli/infra';
import { appServices } from './services.config.ts';

/** The engine config with the app's own monitoring DSN, which the engine passes on beside its contract's fields. */
type CspConfig = EngineConfig & { monitoring?: { dsn: string } };

/**
 * Who may frame a document under `/embed/`: the LTI platforms `ltiFrameAncestors` names, nobody while it names none.
 * @throws when an entry is no bare origin: a path or a `;` would change the policy.
 */
export function embedFrameAncestors(appConfig: EngineConfig): string {
  for (const entry of appConfig.ltiFrameAncestors) {
    if (URL.parse(entry)?.origin !== entry) throw new Error(`frontend-csp: ltiFrameAncestors entry '${entry}' is not an origin`);
  }
  return appConfig.ltiFrameAncestors.join(' ') || "'none'";
}

/**
 * The frontend's Content-Security-Policy for one environment's config: the app origin, the services off it, the buckets,
 * the map styles and the monitoring DSN. A document under `/embed/` passes `embedFrameAncestors`; every other one is
 * framed by the app alone.
 */
export function frontendCsp(appConfig: CspConfig, frameAncestors = "'self'"): string {
  const enabledServiceSlugs = new Set(Object.keys(appServices).filter((slug) => appConfig.services[slug]?.enabled !== false));
  const serviceUrls = appConfig.services as Record<string, { publicUrl?: string }>;
  const servicePublicUrl = (slug: string): string => {
    const url = serviceUrls[slug]?.publicUrl;
    if (!url) throw new Error(`frontend-csp: service '${slug}' has no publicUrl in appConfig.services`);
    return url;
  };

  // Same-origin services collapse into connect-src 'self', so emit an origin only when it differs from the app origin.
  const appOrigin = new URL(appConfig.frontendUrl).origin;
  const originUnlessSelf = (url: string): string => {
    // ws(s):// normalizes to http(s) for the comparison; WebSocket URLs on the app origin are covered by 'self'.
    const origin = new URL(url.replace(/^ws/, 'http')).origin;
    return origin === appOrigin ? '' : new URL(url).origin;
  };

  const cspOrigins = {
    api: originUnlessSelf(servicePublicUrl('backend')),
    yjs: enabledServiceSlugs.has('yjs') ? originUnlessSelf(servicePublicUrl('yjs')).replace(/^http/, 'ws') : '',
    mcp: enabledServiceSlugs.has('mcp') ? originUnlessSelf(servicePublicUrl('mcp')) : '',
    s3Host: appConfig.s3.host ? `https://${appConfig.s3.host}` : '',
    s3Buckets: appConfig.s3.host ? `https://*.${appConfig.s3.host}` : '',
    s3Public: appConfig.s3.publicCDNUrl,
    s3Private: appConfig.s3.privateCDNUrl,
    // The browser posts its error and session reports to the DSN's origin.
    monitoring: appConfig.monitoring?.dsn ? originUnlessSelf(appConfig.monitoring.dsn) : '',
    // The contact map fetches its style, tiles, fonts and icons from each style URL's origin.
    maps: [
      ...new Set(
        Object.values(appConfig.mapStyleUrls ?? {})
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
    `frame-src 'self' *.youtube.com *.vimeo.com *.gleap.io${appConfig.has.ltiPlatform ? ' https:' : ''}`,
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
