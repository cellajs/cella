import { appConfig } from '../../shared'
import { enabledServices } from './services'

const enabledServiceSlugs = new Set(enabledServices(appConfig.services).map((service) => service.slug))
const serviceUrls = appConfig.services as Record<string, { publicUrl?: string }>
const servicePublicUrl = (slug: string): string => {
  const url = serviceUrls[slug]?.publicUrl
  if (!url) throw new Error(`frontend-csp: service '${slug}' has no publicUrl in appConfig.services`)
  return url
}

// Same-origin services collapse into connect-src 'self': emit an origin only
// when it differs from the app origin (a fork still on per-service subdomains).
const appOrigin = new URL(appConfig.frontendUrl).origin
const originUnlessSelf = (url: string): string => {
  // ws(s):// normalizes to http(s) for the comparison; WebSocket URLs on the
  // app origin are covered by 'self' too.
  const origin = new URL(url.replace(/^ws/, 'http')).origin
  return origin === appOrigin ? '' : new URL(url).origin
}

const cspOrigins = {
  api: originUnlessSelf(servicePublicUrl('backend')),
  yjs: enabledServiceSlugs.has('yjs') ? originUnlessSelf(servicePublicUrl('yjs')).replace(/^http/, 'ws') : '',
  mcp: enabledServiceSlugs.has('mcp') ? originUnlessSelf(servicePublicUrl('mcp')) : '',
  s3Host: appConfig.s3.host ? `https://${appConfig.s3.host}` : '',
  s3Buckets: appConfig.s3.host ? `https://*.${appConfig.s3.host}` : '',
  s3Public: appConfig.s3.publicCDNUrl,
  s3Private: appConfig.s3.privateCDNUrl,
}

const connectSrc = [
  `connect-src 'self' blob:`,
  cspOrigins.api,
  cspOrigins.yjs,
  cspOrigins.mcp,
  cspOrigins.s3Host,
  cspOrigins.s3Buckets,
  cspOrigins.s3Public,
  cspOrigins.s3Private,
  'https://*.transloadit.com',
  'wss://*.transloadit.com',
  'https://transloaditstatus.com',
  '*.gleap.io',
  'wss://ws.gleap.io',
  'ingest.maple.dev',
]
  .filter(Boolean)
  .join(' ')

export const frontendCsp = [
  `default-src 'self'`,
  `script-src 'self' *.gleap.io maps.googleapis.com`,
  `worker-src 'self' blob:`,
  `style-src 'self' 'unsafe-inline'`,
  connectSrc,
  `img-src 'self' blob: https: data:`,
  `media-src 'self' blob: data: https://i.ytimg.com *.gleap.io ${cspOrigins.s3Buckets} ${cspOrigins.s3Public} ${cspOrigins.s3Private}`,
  `frame-src 'self' *.youtube.com *.vimeo.com *.gleap.io`,
  `font-src 'self' data:`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
].join('; ').replace(/\s+/g, ' ').trim()