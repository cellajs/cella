import { appConfig } from '../config-builder/app-config.ts';

/**
 * The address a service listens on. A deployed stack takes every interface, where the load balancer and the private
 * network reach it; a local one takes loopback, so it answers no other machine.
 */
export const listenHost = (): string => (appConfig.isDeployed ? '0.0.0.0' : '127.0.0.1');
