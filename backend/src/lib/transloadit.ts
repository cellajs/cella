import crypto from 'node:crypto';
import { appConfig, type UploadTemplateId } from 'shared';
import { uploadTemplates } from 'shared/transloadit-config';
import { nanoid } from 'shared/utils/nanoid';
import { maxFilesPerUpload, uploadStorage } from 'shared/utils/upload-visibility';
import { env } from '#/env';
import { utcDateString } from '#/utils/utc-data-string';

/**
 * Transloadit creates an assembly again from the same signed params until they expire, so the expiry bounds their
 * reuse. The uploader asks a token per assembly, which needs only minutes.
 */
const signedParamsLifetimeMs = 15 * 60 * 1000;

/** Request-body overhead Transloadit counts against `max_size`, on top of the files themselves. */
const uploadOverheadBytes = 1024 * 1024;

/**
 * Signed assembly params for one upload; where the files land follows the template's own visibility. The file count
 * and total size cap what one assembly may carry, whatever the client's own restrictions say.
 */
export const getParams = (templateId: UploadTemplateId, sub: string) => {
  const expires = utcDateString(Date.now() + signedParamsLifetimeMs);

  const authKey = env.TRANSLOADIT_KEY;
  const authSecret = env.TRANSLOADIT_SECRET;
  if (!authKey || !authSecret) throw Error('auth_key_not_found');

  const template = uploadTemplates[templateId];
  const { publicBucket, bucketName } = uploadStorage(templateId);
  const maxSize = maxFilesPerUpload * appConfig.uppy.defaultRestrictions.maxFileSize + uploadOverheadBytes;

  return {
    auth: { key: authKey, expires, max_size: maxSize, max_number_of_files: maxFilesPerUpload },
    // Keeps each signature distinct; it does not make the params single-use.
    nonce: nanoid(16),
    steps: {
      ':original': { robot: '/upload/handle' },
      // Inject steps based on template: avatar thumbnail, cover image, attachments ...
      ...template.steps,
      exported: {
        // Use is also based on template data
        use: template.use,
        robot: '/s3/store',
        credentials: bucketName,
        host: appConfig.s3.host,
        no_vhost: true,
        url_prefix: '',
        acl: publicBucket ? 'public-read' : 'private',
        path: `/${sub}/\${file.id}.\${file.url_name}`,
      },
    },
  };
};

export const getSignature = (paramsString: string) => {
  const hmacKey = env.TRANSLOADIT_SECRET;

  if (!hmacKey) {
    throw new Error('transloadit_secret_not_found');
  }

  // Transloadit request signing requires HMAC-SHA384; this is message authentication, not password storage
  const digest = crypto.createHmac('sha384', hmacKey).update(paramsString, 'utf8').digest('hex');

  return `sha384:${digest}`;
};
