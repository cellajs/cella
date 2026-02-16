import { config } from 'dotenv';
import { z } from 'zod';

// Load .env from backend directory
config({ path: '../backend/.env' });

/**
 * Zod schema for CDC Worker environment variables.
 */
const envSchema = z.object({
  // CDC database URL (cdc_role with REPLICATION + INSERT on activities/counters)
  // Used for both replication stream and activity writes
  // Enforces append-only access - cdc_role cannot UPDATE/DELETE activities
  DATABASE_CDC_URL: z.string().url(),

  // API WebSocket URL for sending activities (defaults to local)
  API_WS_URL: z.url().default('ws://localhost:4000/internal/cdc'),

  // Shared secret for WebSocket authentication (required for security)
  CDC_INTERNAL_SECRET: z.string().min(16, 'CDC_INTERNAL_SECRET must be at least 16 characters'),

  // Development mode
  DEV_MODE: z.enum(['basic', 'core', 'full']).default('core'),
  NODE_ENV: z.enum(['development', 'production', 'staging', 'test']).default('development'),

  // Debug mode (from backend)
  DEBUG: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  // Health server port
  CDC_HEALTH_PORT: z.coerce.number().default(4001),
});

/**
 * Validated environment variables for CDC Worker.
 */
export const env = envSchema.parse(process.env);
