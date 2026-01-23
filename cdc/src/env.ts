import { config } from 'dotenv';
import { z } from 'zod';

// Load .env from backend directory
config({ path: '../backend/.env' });

/**
 * Zod schema for CDC Worker environment variables.
 */
const envSchema = z.object({
  // Database connection (required)
  DATABASE_URL: z.string().url(),

  // API WebSocket URL for sending activities (defaults to local)
  API_WS_URL: z.string().url().default('ws://localhost:4000/internal/cdc'),

  // Shared secret for WebSocket authentication
  CDC_INTERNAL_SECRET: z.string().optional(),

  // Development mode
  DEV_MODE: z.enum(['basic', 'core', 'full']).default('core'),
  NODE_ENV: z.enum(['development', 'production', 'staging', 'test']).default('development'),

  // Health server port
  CDC_HEALTH_PORT: z.coerce.number().default(4001),
});

/**
 * Validated environment variables for CDC Worker.
 */
export const env = envSchema.parse(process.env);
