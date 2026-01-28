import { z } from 'zod';

/**
 * Zod schema for Proxy server environment variables.
 * All variables have sensible defaults for local development.
 */
const envSchema = z.object({
  // Environment
  NODE_ENV: z.enum(['development', 'production', 'staging', 'test']).default('development'),

  // Proxy server port
  PROXY_PORT: z.coerce.number().default(8000),

  // Backend API URL (internal)
  API_URL: z.string().url().default('http://localhost:4000'),

  // CDC Worker URL (internal)
  CDC_URL: z.string().url().default('http://localhost:4001'),

  // Vite dev server URL (development only)
  VITE_DEV_URL: z.string().url().default('http://localhost:3000'),

  // Static files directory (production only, relative to proxy root)
  STATIC_DIR: z.string().default('../frontend/dist'),

  // Timeout for upstream service health checks (ms)
  HEALTH_CHECK_TIMEOUT: z.coerce.number().default(5000),

  // Log level
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

/**
 * Validated environment variables for the Proxy server.
 */
export const env = envSchema.parse(process.env);

/** Check if running in production mode. */
export const isProduction = env.NODE_ENV === 'production';

/** Check if running in development mode. */
export const isDevelopment = env.NODE_ENV === 'development';
