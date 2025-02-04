import { config } from 'config';
import { clientConfig, handleResponse } from '~/lib/api';
import type { TokenModel } from '#/db/schema/tokens';
import { authHc } from '#/modules/auth/hc';

export const client = authHc(config.backendUrl, clientConfig);

// OAuth endpoints
export const githubSignInUrl = client.github.$url().href;
export const googleSignInUrl = client.google.$url().href;
export const microsoftSignInUrl = client.microsoft.$url().href;

type TokenType = { token: string };
type SignUpProps = Parameters<(typeof client)['sign-up']['$post']>['0']['json'];

/**
 * Sign up a user with the provided email and password
 *
 * @param body - User details including email and password.
 * @param body.email - Email address for user.
 * @param body.password - Password for user account.
 * @returns A boolean indicating success of the sign-up process.
 */
export const signUp = async (body: SignUpProps) => {
  const response = await client['sign-up'].$post({
    json: body,
  });

  const json = await handleResponse(response);
  return json.success;
};

/**
 * Sign up with invitation token
 *
 * @param token - Invitation token to sign up with.
 * @param email - Email address of user.
 * @param password - Password to set for user.
 * @returns A boolean indicating success of the sign-up process.
 */
export const signUpWithToken = async ({ email, password, token }: TokenType & SignUpProps) => {
  const response = await client['sign-up'][':token'].$post({
    param: { token },
    json: { email, password },
  });

  const json = await handleResponse(response);
  return json.success;
};

/**
 * Check if email exists
 *
 * @param email - Email address to check.
 * @returns A boolean indicating if email is already registered.
 */
export const checkEmail = async (email: string) => {
  const response = await client['check-email'].$post({
    json: { email },
  });

  const json = await handleResponse(response);
  return json.success;
};

/**
 * Verify user's email with token sent by email
 *
 * @param token - Verification token received by user.
 */
export const verifyEmail = async ({ token }: TokenType) => {
  const response = await client['verify-email'][':token'].$post({
    param: { token },
  });

  await handleResponse(response);
};

type SignInProps = Parameters<(typeof client)['sign-in']['$post']>['0']['json'];

/**
 * Sign in a user with email and password
 *
 * @param email - User's email address.
 * @param password - User's password.
 * @returns A boolean indicating if the user's email is verified.
 */
export const signIn = async ({ email, password }: SignInProps) => {
  const response = await client['sign-in'].$post({
    json: { email, password },
  });

  const json = await handleResponse(response);
  return json.data.emailVerified;
};

/**
 * Start impersonation session by system admin
 *
 * @param targetUserId - The user ID to impersonate.
 * @returns A boolean indicating success of the impersonation start.
 */
export const impersonationStart = async (targetUserId: string) => {
  const response = await client.impersonation.start.$get({
    query: { targetUserId },
  });

  const json = await handleResponse(response);
  return json.success;
};

/**
 * Send a new verification email
 *
 * @param tokenId - Optional token ID for additional verification.
 * @param userId - Optional user ID to target for verification.
 */
export const sendVerificationEmail = async ({ tokenId, userId }: { tokenId?: string; userId?: string }) => {
  const response = await client['send-verification-email'].$post({
    json: { tokenId, userId },
  });

  await handleResponse(response);
};

/**
 * Send email to create new password
 *
 * @param email - Email address to send password creation instructions to.
 */
export const requestPasswordEmail = async (email: string) => {
  const response = await client['request-password'].$post({
    json: { email },
  });

  await handleResponse(response);
};

/**
 * Create new password for a user
 *
 * @param token - Token for verifying password creation.
 * @param password - Password to set.
 */
export const createPassword = async ({ token, password }: TokenType & { password: string }) => {
  const response = await client['create-password'][':token'].$post({
    param: { token },
    json: { password },
  });

  await handleResponse(response);
};

/**
 * Check token validation
 *
 * @param id - Token ID.
 * @param type - Type of the token (`"email_verification" | "password_reset" | "invitation"`).
 * @returns Token data
 */
export const checkToken = async ({ id, type }: { id: string; type: TokenModel['type'] }) => {
  const response = await client['check-token'][':id'].$post({
    param: { id },
    query: { type },
  });

  const json = await handleResponse(response);
  return json.data;
};

/**
 * Accept an invitation
 *
 * @param token - Invitation token to accept.
 * @returns A boolean indicating success of invitation accept.
 */
export const acceptOrgInvite = async ({ token }: TokenType) => {
  const response = await client['accept-invite'][':token'].$post({
    param: { token },
  });

  const json = await handleResponse(response);
  return json.success;
};

/**
 * Stop impersonation session, returning to user admin page
 */
export const impersonationStop = () => client.impersonation.stop.$get();

/**
 * Sign out the current user
 */
export const signOut = () => client['sign-out'].$get();

/**
 * Get challenge for passkey authentication
 *
 * @returns The challenge data for passkey authentication.
 */
export const getChallenge = async () => {
  const response = await client['passkey-challenge'].$get();
  const json = await handleResponse(response);
  return json;
};

type RegisterPasskeyProp = Parameters<(typeof client)['passkey-registration']['$post']>['0']['json'];

/**
 * Register a passkey for a user
 *
 * @param data - Passkey registration data.
 * @param data.userEmail - Email address of the user.
 * @param data.attestationObject - Attestation object from the WebAuthn response.
 * @param data.clientDataJSON - Client data JSON from the WebAuthn response.
 * @returns A boolean indicating success of the passkey registration.
 */
export const registerPasskey = async (data: RegisterPasskeyProp) => {
  const apiResponse = await client['passkey-registration'].$post({
    json: data,
  });
  const json = await handleResponse(apiResponse);
  return json.success;
};

type AuthWithPasskeyProp = Parameters<(typeof client)['passkey-verification']['$post']>['0']['json'];

/**
 * Authenticate a user through passkey
 *
 * @param data - Passkey verification data.
 * @param data.userEmail - Email address of the user.
 * @param data.clientDataJSON - Client data JSON from the WebAuthn response.
 * @param data.authenticatorData - Authenticator data from the WebAuthn response.
 * @param data.signature - Signature from the WebAuthn response.
 * @returns A boolean indicating success of the passkey authentication.
 */
export const authenticateWithPasskey = async (data: AuthWithPasskeyProp) => {
  const response = await client['passkey-verification'].$post({
    json: data,
  });

  const json = await handleResponse(response);
  return json.success;
};
