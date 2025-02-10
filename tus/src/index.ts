import { config } from 'config';
import { env } from '../env';
import { ImadoTus } from './imado-tus';

const tus = ImadoTus({
  secret: env.TUS_SECRET,
  serverOptions: {
    respectForwardedHeaders: true,
  },
  credentials: {
    bucket: config.s3UploadBucket,
    region: config.s3UploadRegion,
    accessKeyId: env.AWS_S3_UPLOAD_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_S3_UPLOAD_SECRET_ACCESS_KEY,
  },
});

const tusUrl = new URL(config.tusUrl);

tus.listen({
  host: '0.0.0.0',
  port: Number(config.tusPort),
});

console.info(`${config.name} TUS server is available on ${tusUrl}`);
