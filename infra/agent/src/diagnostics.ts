import { createHash, createHmac } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { type FetchLike, resolveFetch } from '../../lib/utils/fetch-like'

export interface UploadBootDiagnosticsOptions {
  bucket: string
  region: string
  accessKey: string
  secretKey: string
  service: string
  releaseSha: string
  bootRc: number
  logFile: string
  appLogs?: string
  now?: Date
  fetchImpl?: FetchLike
}

function hmac(key: Buffer | string, msg: string): Buffer {
  return createHmac('sha256', key).update(msg, 'utf-8').digest()
}

function signingKey(secretKey: string, date: string, region: string): Buffer {
  return hmac(hmac(hmac(hmac(`AWS4${secretKey}`, date), region), 's3'), 'aws4_request')
}

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf-8').digest('hex')
}

function timestamp(now: Date): { amzDate: string; date: string; keyStamp: string } {
  const iso = now.toISOString().replace(/[:-]/g, '').replace(/\.\d{3}Z$/, 'Z')
  return { amzDate: iso, date: iso.slice(0, 8), keyStamp: iso }
}

async function putObject(opts: UploadBootDiagnosticsOptions, key: string, body: string): Promise<void> {
  const fetchImpl = resolveFetch(opts.fetchImpl)
  const host = `${opts.bucket}.s3.${opts.region}.scw.cloud`
  const { amzDate, date } = timestamp(opts.now ?? new Date())
  const payloadHash = hash(body)
  const canonicalUri = `/${key.split('/').map((part) => encodeURIComponent(part)).join('/')}`
  const canonicalHeaders = `content-type:text/plain; charset=utf-8\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date'
  const canonicalRequest = ['PUT', canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const scope = `${date}/${opts.region}/s3/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, hash(canonicalRequest)].join('\n')
  const signature = createHmac('sha256', signingKey(opts.secretKey, date, opts.region)).update(stringToSign, 'utf-8').digest('hex')
  const res = await fetchImpl(`https://${host}${canonicalUri}`, {
    method: 'PUT',
    body,
    headers: {
      Authorization: `AWS4-HMAC-SHA256 Credential=${opts.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Amz-Content-Sha256': payloadHash,
      'X-Amz-Date': amzDate,
    },
  })
  if (!res.ok) throw new Error(`boot diagnostics upload ${key} -> ${res.status}: ${await res.text()}`)
}

export async function uploadBootDiagnostics(opts: UploadBootDiagnosticsOptions): Promise<string[]> {
  const now = opts.now ?? new Date()
  const { keyStamp } = timestamp(now)
  let log = ''
  try {
    log = await readFile(opts.logFile, 'utf-8')
  } catch {
    log = 'boot log not found\n'
  }
  const parts = [`service=${opts.service}`, `release=${opts.releaseSha}`, `boot_rc=${opts.bootRc}`, '', log]
  // The agent runs containerized without the host boot log mounted, so the file
  // read above is usually empty; the captured app logs carry the crash reason.
  if (opts.appLogs?.trim()) parts.push('', '--- app logs ---', opts.appLogs)
  const body = parts.join('\n')
  const keys = [`boot-diag/${opts.service}-${keyStamp}-boot.log`]
  if (opts.bootRc !== 0) keys.push(`boot-diag/${opts.service}-failed-${keyStamp}.log`)
  for (const key of keys) await putObject({ ...opts, now }, key, body)
  return keys
}
