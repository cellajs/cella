import { appConfig } from 'shared';

/** Image keys in newsletter HTML as public CDN URLs, the URLs the app builds for public files; a `blob:` key stays as it is. */
export const replaceSignedSrcs = (content: string): string =>
  content.replace(
    /src\s*=\s*(['"])(.*?)\1/gi,
    (_, quote: string, key: string) => `src=${quote}${key.startsWith('blob:') ? key : `${appConfig.s3.publicCDNUrl}/${key}`}${quote}`,
  );
