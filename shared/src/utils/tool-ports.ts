import { appConfig } from '../config-builder/app-config.ts';

/** The port the Vite dev server listens on: the origin's, or the configured one where the origin carries none (tunnel mode). */
export const frontendDevPort = (): number => Number(new URL(appConfig.frontendUrl).port) || appConfig.services.frontend.port;

/** Storybook follows the frontend port, far enough above the service block of any app number. */
export const storybookPort = (): number => frontendDevPort() + 3006;

/** Drizzle Studio follows the frontend port, below the service block of the next app number. */
export const drizzleStudioPort = (): number => frontendDevPort() + 983;
