import { appConfig } from 'shared';

/** Drizzle Studio port derived from backend port + 983. Defaults to 4983. */
export const STUDIO_PORT = Number(new URL(appConfig.backendUrl).port) + 983;
