import { appConfig } from '../pulumi-context'
import { enabledServices } from './services'

const enabledServiceSlugs = new Set(enabledServices(appConfig.has).map((service) => service.slug))

const cspOrigins = {
  api: new URL(appConfig.backendUrl).origin,
  yjs: enabledServiceSlugs.has('yjs') ? new URL(appConfig.yjsUrl).origin.replace(/^http/, 'ws') : '',
  ai: enabledServiceSlugs.has('ai') ? new URL(appConfig.aiUrl).origin : '',
  s3Host: appConfig.s3.host ? `https://${appConfig.s3.host}` : '',
  s3Buckets: appConfig.s3.host ? `https://*.${appConfig.s3.host}` : '',
  s3Public: appConfig.s3.publicCDNUrl,
  s3Private: appConfig.s3.privateCDNUrl,
}

export const frontendCsp = [
  `default-src 'self'`,
  `script-src 'self' *.gleap.io`,
  `worker-src 'self' blob:`,
  `style-src 'self' 'unsafe-inline'`,
  `connect-src 'self' blob: ${cspOrigins.api} ${cspOrigins.yjs} ${cspOrigins.ai} ${cspOrigins.s3Host} ${cspOrigins.s3Buckets} ${cspOrigins.s3Public} ${cspOrigins.s3Private} https://*.transloadit.com wss://*.transloadit.com https://transloaditstatus.com *.gleap.io wss://ws.gleap.io`,
  `img-src 'self' blob: https: data:`,
  `media-src 'self' blob: data: https://i.ytimg.com *.gleap.io ${cspOrigins.s3Buckets} ${cspOrigins.s3Public} ${cspOrigins.s3Private}`,
  `frame-src 'self' *.youtube.com *.vimeo.com *.gleap.io`,
  `font-src 'self' data:`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
].join('; ').replace(/\s+/g, ' ').trim()