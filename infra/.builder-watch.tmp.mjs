// Prints the builder's step and result objects as they change, read with the observer key. Usage: node builder-watch.mjs <sha>
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

const [sha] = process.argv.slice(2);
const project = '0e35dfaf-61f7-4c67-a207-64fd05914feb';
const s3 = new S3Client({
  region: 'nl-ams',
  endpoint: 'https://s3.nl-ams.scw.cloud',
  credentials: { accessKeyId: `${process.env.OBS_AK}@${project}`, secretAccessKey: process.env.OBS_SK },
});
const read = async (name) => {
  try {
    const o = await s3.send(new GetObjectCommand({ Bucket: 'cella-staging-boot-diag', Key: `boot-diag/builder/${sha}/${name}` }));
    return (await o.Body.transformToString()).trim();
  } catch (e) {
    return e.name === 'NoSuchKey' ? undefined : `(${e.name})`;
  }
};
let last = '';
const started = Date.now();
for (;;) {
  const step = await read('step');
  const result = await read('result');
  const line = `step=${step ?? '-'} result=${result ?? '-'}`;
  if (line !== last) {
    console.log(`${Math.round((Date.now() - started) / 1000)}s ${line}`);
    last = line;
  }
  if (result) break;
  if (Date.now() - started > 55 * 60_000) {
    console.log('watch gave up');
    break;
  }
  await new Promise((r) => setTimeout(r, 15000));
}
