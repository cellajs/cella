import { CopyObjectCommand, DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { FileStore } from '@tus/file-store';
import { S3Store } from '@tus/s3-store';
import { MemoryLocker, Server, type ServerOptions, type Upload } from '@tus/server';

import type http from 'node:http';
import jwt from 'jsonwebtoken';

type ModifiedServerOptions = Omit<ServerOptions, 'locker' | 'path'>;

interface AWSCredentials {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

interface TusOptions {
  secret: string;
  credentials: AWSCredentials;
  serverOptions?: ModifiedServerOptions;
}

async function moveS3Object(oldKey: string, newKey: string, credentials: AWSCredentials) {
  const s3Client = new S3Client({
    region: credentials.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
    },
  });

  await s3Client.send(
    new CopyObjectCommand({
      Bucket: credentials.bucket,
      CopySource: `${credentials.bucket}/${oldKey}`,
      Key: newKey,
      MetadataDirective: 'COPY',
    }),
  );

  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: credentials.bucket,
      Key: oldKey,
    }),
  );
}

function optionallyStoreInS3(options: ServerOptions & { datastore: FileStore }, credentials: AWSCredentials) {
  return {
    ...options,
    datastore: new S3Store({
      partSize: 8 * 1024 * 1024, // Each uploaded part will have ~8MiB,
      s3ClientConfig: {
        bucket: credentials.bucket,
        region: credentials.region,
        credentials: {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
        },
      },
    }),
    async onUploadFinish(req: http.IncomingMessage, res: http.ServerResponse, upload: Upload) {
      const auth = req.headers.authorization;
      const token = (auth as string).split(' ')[1];
      const sub = jwt.decode(token)?.sub;

      // sub in JWT is used as path in S3 (e.g. user id, or w/ organization id)
      await moveS3Object(upload.id, `${sub}/${upload.id}`, credentials);
      // also move the info file
      await moveS3Object(`${upload.id}.info`, `${sub}/${upload.id}.info`, credentials);

      return res;
    },
  };
}

function extractContentType(upload: Upload) {
  const mimeType = upload.metadata?.type;
  return mimeType;
}

export const ImadoTus = (opts: TusOptions) => {
  return new Server(
    optionallyStoreInS3(
      {
        ...opts.serverOptions,
        path: '/upload',
        locker: new MemoryLocker(),
        datastore: new FileStore({
          directory: './files',
        }),
        async onUploadCreate(_, res, upload) {
          console.debug('Upload created:', upload);
          const contentType = extractContentType(upload) ?? null;
          const metadata = { ...upload.metadata, contentType };
          return { res, metadata };
        },
        async onIncomingRequest(req: http.IncomingMessage, _res: http.ServerResponse) {
          const auth = req.headers.authorization;

          if (!auth) {
            throw { status_code: 401, body: 'Unauthorized' };
          }

          try {
            const token = auth.split(' ')[1];

            // If you want to know who uploaded or create secrets per client you can implement something like this:
            // const sub = jwt.decode(token)?.sub;
            // const secret = await db.query('SELECT secret FROM users WHERE id = $1', [sub]);

            // Verify secret and token, will throw error if invalid
            await jwt.verify(token, opts.secret);
          } catch (error) {
            console.error('Invalid token', error);
            throw { status_code: 401, body: 'Invalid token' };
          }
        },
        async onUploadFinish(_, res, upload) {
          console.debug('Upload finished:', upload);
          return { res };
        },
        async onResponseError(_, __, err) {
          console.error('Error:', err);
          return { status_code: 500, body: 'TUS Server Error' };
        },
      },
      opts.credentials,
    ),
  );
};
