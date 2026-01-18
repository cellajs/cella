import { createClient } from '@scaleway/sdk';
import { env } from '#/env';

/**
 * Creates a Scaleway SDK client for API interactions.
 * Used for Edge Services and other Scaleway APIs.
 */
export const createScalewayClient = (): ReturnType<typeof createClient> => {
  if (!env.SCALEWAY_ACCESS_KEY || !env.SCALEWAY_SECRET_KEY || !env.SCALEWAY_PROJECT_ID) {
    throw new Error(
      'Scaleway credentials not configured. Set SCALEWAY_ACCESS_KEY, SCALEWAY_SECRET_KEY, and SCALEWAY_PROJECT_ID.',
    );
  }

  return createClient({
    accessKey: env.SCALEWAY_ACCESS_KEY,
    secretKey: env.SCALEWAY_SECRET_KEY,
    defaultProjectId: env.SCALEWAY_PROJECT_ID,
    defaultRegion: env.SCALEWAY_REGION,
  });
};

/**
 * Check if Scaleway hosting is configured and available.
 */
export const isScalewayConfigured = (): boolean => {
  return !!(env.SCALEWAY_ACCESS_KEY && env.SCALEWAY_SECRET_KEY && env.SCALEWAY_PROJECT_ID);
};

/**
 * Get the S3 endpoint URL for Scaleway Object Storage.
 */
export const getS3Endpoint = (): string => {
  return `https://s3.${env.SCALEWAY_REGION}.scw.cloud`;
};

/**
 * Generate a bucket name for a repository's hosting.
 * @param repositoryId - The repository ID to generate a bucket name for.
 */
export const generateBucketName = (repositoryId: string): string => {
  return `${env.SCALEWAY_HOSTING_BUCKET_PREFIX}-${repositoryId}`;
};

/**
 * Generate the default subdomain for a repository.
 * @param repositoryId - The repository ID.
 */
export const generateDefaultDomain = (repositoryId: string): string => {
  // Use first 8 chars of ID for shorter, friendlier subdomain
  const shortId = repositoryId.slice(0, 8);
  return `${shortId}.${env.SCALEWAY_EDGE_DOMAIN}`;
};
