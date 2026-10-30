import { appConfig } from '../config-builder/app-config.ts';

/**
 * The address a service listens on. Production and staging take every interface, where the load balancer and the
 * private network reach it; every other mode takes loopback, so a local stack answers no other machine.
 */
export const listenHost = (): string => (appConfig.mode === 'production' || appConfig.mode === 'staging' ? '0.0.0.0' : '127.0.0.1');
