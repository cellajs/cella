import { appConfig } from 'shared';
import { getSignedUrlFromKey } from '#/lib/signed-url';

export const replaceSignedSrcs = async (content: string): Promise<string> => {
  // Regex to match src="..." or src='...'
  // Captures quote type in g1 and actual URL in g2
  const srcRegex = /src\s*=\s*(['"])(.*?)\1/gi;

  // Extract all src URLs
  const srcs = [...content.matchAll(srcRegex)].map(([_, __, src]) => src);

  // Map to hold original -> signed URL replacements
  const replacements = new Map<string, string>();

  // Fetch signed URLs for all unique srcs
  await Promise.all(
    Array.from(new Set(srcs)).map(async (src) => {
      try {
        const signed = await getSignedUrlFromKey(src, {
          isPublic: true,
          bucketName: appConfig.s3.publicBucket,
        });
        replacements.set(src, signed);
      } catch {
        // fallback to original if signing fails
        replacements.set(src, src);
      }
    }),
  );

  // Replace all src attributes in content
  return content.replace(srcRegex, (_, quote, src) => `src=${quote}${replacements.get(src) ?? src}${quote}`);
};
