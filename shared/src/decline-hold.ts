import { appConfig } from './config-builder/app-config.ts';

const holdMs = appConfig.retention.declinedInvitationHoldDays * 24 * 60 * 60 * 1000;

/**
 * Whether a decline still holds: until it stops, no invite opens the invitation again or mails its address. One source
 * for the server's invite plan and the invite form's result, so the form never says an invitation went out that did not.
 * @param declinedAt - The invitation's `rejectedAt`; none for an invitation nobody declined.
 */
export const declineHolds = (declinedAt?: string | null) => !!declinedAt && Date.parse(declinedAt) + holdMs > Date.now();
