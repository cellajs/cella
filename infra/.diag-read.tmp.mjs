import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

const project = '0e35dfaf-61f7-4c67-a207-64fd05914feb';
const s3 = new S3Client({
  region: 'nl-ams',
  endpoint: 'https://s3.nl-ams.scw.cloud',
  credentials: { accessKeyId: `${process.env.OBS_AK}@${project}`, secretAccessKey: process.env.OBS_SK },
});
const sha = process.argv[2];
const list = await s3.send(new ListObjectsV2Command({ Bucket: 'cella-staging-boot-diag', Prefix: process.argv[3] ?? 'boot-diag/' }));
const keys = (list.Contents ?? []).map((o) => o.Key).filter((k) => k.includes(sha.slice(0, 7)) || k.includes(sha));
console.log('keys:', keys.join('\n  '));
for (const key of keys.filter((k) => /\.log$/.test(k))) {
  const body = await (await s3.send(new GetObjectCommand({ Bucket: 'cella-staging-boot-diag', Key: key }))).Body.transformToString();
  console.log(`===== ${key} (${body.length} chars)`);
  console.log(
    body
      .split('\n')
      .filter((l) => /migrat|MODE|rror|ECONN|imeout|lock|listening|release|exit|Migration|statement|waiting/i.test(l))
      .slice(0, 60)
      .join('\n'),
  );
}
