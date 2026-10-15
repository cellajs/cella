/**
 * The builder's Object Storage client: a script on Node's built-ins alone (SigV4 with `node:crypto`, `fetch`), so the uploads depend neither on
 * the machine image's curl nor on any package. The builder runs it in its `node` image with a key in `S3_AK`/`S3_SK` and nothing of the app.
 *   node s3.mjs put <bucket> <key> <file> [content-type] [cache-control]
 *   node s3.mjs upload <bucket> <list>    (the tab-separated list of tasks/release-files.ts; `releases/` lines last)
 * Written with String.raw and without a dollar-brace, as it is a file of the builder's cloud-init.
 */
export const S3_SCRIPT = String.raw`import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

const region = process.env.REGION;
const accessKey = process.env.S3_AK;
const secretKey = process.env.S3_SK;
if (!region || !accessKey || !secretKey) throw new Error('REGION, S3_AK and S3_SK are required');

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();
const encodeKey = (key) => key.split('/').map((part) => encodeURIComponent(part).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())).join('/');

async function put(bucket, key, body, contentType, cacheControl) {
  const host = bucket + '.s3.' + region + '.scw.cloud';
  const path = '/' + encodeKey(key);
  const amzDate = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const day = amzDate.slice(0, 8);
  const payloadHash = sha256(body);
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonical = ['PUT', path, '', 'host:' + host, 'x-amz-content-sha256:' + payloadHash, 'x-amz-date:' + amzDate, '', signedHeaders, payloadHash].join('\n');
  const scope = day + '/' + region + '/s3/aws4_request';
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
  const signingKey = hmac(hmac(hmac(hmac('AWS4' + secretKey, day), region), 's3'), 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(toSign).digest('hex');
  const headers = {
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    authorization: 'AWS4-HMAC-SHA256 Credential=' + accessKey + '/' + scope + ', SignedHeaders=' + signedHeaders + ', Signature=' + signature,
  };
  if (contentType) headers['content-type'] = contentType;
  if (cacheControl) headers['cache-control'] = cacheControl;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch('https://' + host + path, { method: 'PUT', headers, body });
    if (res.ok) return;
    const text = (await res.text()).slice(0, 300);
    if (attempt >= 3 || res.status < 500) throw new Error('PUT ' + key + ' -> ' + res.status + ': ' + text);
  }
}

const [command, bucket, ...rest] = process.argv.slice(2);
if (command === 'put') {
  const [key, file, contentType, cacheControl] = rest;
  await put(bucket, key, readFileSync(file), contentType, cacheControl);
} else if (command === 'upload') {
  const lines = readFileSync(rest[0], 'utf8').split('\n').filter(Boolean).map((line) => line.split('\t'));
  const send = async (rows, width) => {
    const queue = [...rows];
    await Promise.all(Array.from({ length: width }, async () => {
      for (let row = queue.shift(); row; row = queue.shift()) await put(bucket, row[1], readFileSync(row[0]), row[2], row[3]);
    }));
  };
  // The release's entry files after every file they reference.
  await send(lines.filter((row) => !row[1].startsWith('releases/')), 16);
  await send(lines.filter((row) => row[1].startsWith('releases/')), 1);
  console.log('uploaded ' + lines.length + ' file(s)');
} else {
  throw new Error('usage: s3.mjs put <bucket> <key> <file> [type] [cache] | upload <bucket> <list>');
}
`;
