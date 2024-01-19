import { ImadoUrl } from '@cellajs/imado';
import config from 'config';
import { env } from 'env';

export const getImadoUrl = new ImadoUrl({
  signUrl: config.privateFilesUrl,
  cloudfrontKeyId: env.AWS_CLOUDFRONT_KEY_ID,
  cloudfrontPrivateKey: env.AWS_CLOUDFRONT_PRIVATE_KEY,
});
