import { z } from 'zod';

/**
 * This schema defines additional, customizable environment variables
 * that extend the main application appConfig (`env.ts`).
 */
export const additionalEnvSchema = z.object({
  // Scaleway hosting configuration
  SCALEWAY_ACCESS_KEY: z.string().optional(),
  SCALEWAY_SECRET_KEY: z.string().optional(),
  SCALEWAY_PROJECT_ID: z.string().optional(),
  SCALEWAY_REGION: z.string().default('fr-par'),
  SCALEWAY_HOSTING_BUCKET_PREFIX: z.string().default('hosting'),
  SCALEWAY_EDGE_DOMAIN: z.string().default('edge.scw.cloud'), // Base domain for auto-generated subdomains

  // Deployment worker configuration
  DEPLOYMENT_WORKER_ENABLED: z.coerce.boolean().default(true),
  DEPLOYMENT_WORKER_POLL_INTERVAL: z.coerce.number().default(10_000), // ms
  DEPLOYMENT_WORKER_MAX_CONCURRENT: z.coerce.number().default(3),
});
