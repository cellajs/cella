import { env } from '#/env';
import { uploadTemplates } from '#/lib/transloadit/templates';
import { nanoid } from '#/utils/nanoid';
import { utcDateString } from '#/utils/utc-data-string';

import crypto from 'node:crypto';
import { type UploadTemplateId, config } from 'config';

export const getParams = (templateId: UploadTemplateId, isPublic: boolean, sub: string) => {
  // Transloadit security requires us to set an expiration date like this
  const expires = utcDateString(Date.now() + 1 * 60 * 60 * 1000); // 1 hour

  // And a nonce to prevent replay attacks
  const nonce = nanoid(16);

  const authKey = env.TRANSLOADIT_KEY;
  const authSecret = env.TRANSLOADIT_SECRET;
  if (!authKey || !authSecret) throw Error('missing_auth_key');

  const template = uploadTemplates[templateId];

  return {
    auth: {
      key: authKey,
      expires,
      nonce,
    },
    steps: {
      ':original': { robot: '/upload/handle' },
      // Inject steps based on template: avatar thumbnail, cover image, attachments ...
      ...template.steps,
      exported: {
        // Use is also based on template data
        use: template.use,
        robot: '/s3/store',
        credentials: isPublic ? config.s3PublicBucket : config.s3PrivateBucket,
        host: config.s3Host,
        no_vhost: true,
        url_prefix: '',
        acl: isPublic ? 'public-read' : 'private',
        path: `/${sub}/\${file.id}.\${file.url_name}`,
      },
    },
  };
};

export const getSignature = (paramsString: string) => {
  const authSecret = env.TRANSLOADIT_SECRET;
  if (!authSecret) throw Error('missing_auth_key');

  const signatureBytes = crypto.createHmac('sha384', authSecret).update(Buffer.from(paramsString, 'utf-8'));
  // The final signature needs the hash name in front, so
  // the hashing algorithm can be updated in a backwards-compatible
  // way when old algorithms become insecure.
  return `sha384:${signatureBytes.digest('hex')}`;
};
