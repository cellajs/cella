import { appConfig } from '../config-builder/app-config.ts';

/** Whether an address is a demo account's placeholder: such an account ends with its demo, and nothing signs it back in. */
export const isDemoAddress = (address: string | null | undefined): boolean => !!address?.endsWith(`@${appConfig.demo.addressDomain}`);
