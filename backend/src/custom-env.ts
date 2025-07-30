import { z } from 'zod';

/**
 * This schema defines additional, customizable environment variables
 * that extend the main application config (`env.ts`).
 */
export const additionalEnvSchema = z.object({});
