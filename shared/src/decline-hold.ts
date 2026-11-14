import { appConfig } from './config-builder/app-config.ts';

const holdMs = appConfig.retention.declinedInvitationHoldDays * 24 * 60 * 60 * 1000;

/**
 * When a decline stops holding: the nightly sweep removes the declined invitation after it, so the address can be
 * invited again up to a day later.
 * @returns Epoch milliseconds.
 */
export const declineHoldEnd = (declinedAt: string) => Date.parse(declinedAt) + holdMs;
