import { z } from 'zod';

/**
 * This schema defines additional, customizable environment variables
 * that extend the main application appConfig (`env.ts`).
 */
export const additionalEnvSchema = z.object({});
