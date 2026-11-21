/**
 * What the rest of the app may import from the auth module; everything else under `modules/auth` is the module's own
 * (`core/` the session substrate, `flows/` the app's sign-in methods, `account/` the account-security surface), and
 * `backend/tests/auth-boundary.test.ts` holds the line. The boundary is described in `cella/docs/AUTHENTICATION.md`.
 */

export { insertAnonymousUser, startAnonymousSession } from '#/modules/auth/core/anonymous/anonymous-account';
export { authEvents } from '#/modules/auth/core/auth-events';
export { isRecognizedBrowser } from '#/modules/auth/core/devices/operations/recognized-browser';
export { isFederationConfigured, isFederationKey } from '#/modules/auth/core/federations/federations';
export { federationKeySchema } from '#/modules/auth/core/federations/federations-schema';
export { authCookieName, cookieSecrets, deleteAuthCookie, getAuthCookie } from '#/modules/auth/core/general/helpers/cookie';
export { sendSecurityInboxEmail } from '#/modules/auth/core/general/helpers/send-account-security-email';
export {
  asksForEmbeddedSession,
  findSession,
  type ResolvedSession,
  resolveSession,
  sessionRefusal,
} from '#/modules/auth/core/sessions/operations/resolve-session';
export { closeSessions, revokeConnectionSessions } from '#/modules/auth/core/sessions/operations/revoke-sessions';
export type { SessionFacts, SessionModel, SessionRevocationReason } from '#/modules/auth/core/sessions/sessions-db';
export { findSessionStates } from '#/modules/auth/core/sessions/sessions-queries';
export { sessionBaseSchema } from '#/modules/auth/core/sessions/sessions-schema';
export { type StepUpTier, stepUpWindow } from '#/modules/auth/core/step-up/helpers/step-up';
export { requireStepUp } from '#/modules/auth/core/step-up/operations/read-step-up';
export { type AuthStrategy, amrOf, authStrategiesEnum, type StepUpProof, stepUpProofs } from '#/modules/auth/core/strategies';
export { issueHandoffToken, issueTokens, readHandoffToken, spendHandoffToken } from '#/modules/auth/core/tokens/token-lifecycle';
export { type LinkTokenKind, tokenLinkUrl, tokenPolicies } from '#/modules/auth/core/tokens/token-policies';
export { countLiveSystemInvitations, deleteInvitationTokens, findSystemInvitationTokens } from '#/modules/auth/core/tokens/tokens-queries';
