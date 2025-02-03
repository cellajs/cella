import { config } from 'config';
import { clientConfig, handleResponse } from '~/lib/api';
import type { TokenModel } from '#/db/schema/tokens';
import { authHc } from '#/modules/auth/hc';

// RPC
export const client = authHc(config.backendUrl, clientConfig);

// Oath endpoints
export const githubSignInUrl = client.github.$url().href;
export const googleSignInUrl = client.google.$url().href;
export const microsoftSignInUrl = client.microsoft.$url().href;

export type TokenType = { token: string };
export type SignUpProps = Parameters<(typeof client)['sign-up']['$post']>['0']['json'];

// Sign up a user with the provided email and password
export const signUp = async (body: SignUpProps) => {
  const response = await client['sign-up'].$post({
    json: body,
  });

  const json = await handleResponse(response);
  return json.success;
};

// Sign up with invitation token
export const signUpWithToken = async ({ email, password, token }: TokenType & SignUpProps) => {
  const response = await client['sign-up'][':token'].$post({
    param: { token },
    json: { email, password },
  });

  const json = await handleResponse(response);
  return json.success;
};

// Check if email exists
export const checkEmail = async (email: string) => {
  const response = await client['check-email'].$post({
    json: { email },
  });

  const json = await handleResponse(response);
  return json.success;
};

export type VerifyEmailProps = TokenType;

// Verify the user's email with token sent by email
export const verifyEmail = async ({ token }: VerifyEmailProps) => {
  const response = await client['verify-email'][':token'].$post({
    param: { token },
  });

  await handleResponse(response);
};

export type SignInProps = Parameters<(typeof client)['sign-in']['$post']>['0']['json'];

// Sign in a user with email and password
export const signIn = async ({ email, password }: SignInProps) => {
  const response = await client['sign-in'].$post({
    json: { email, password },
  });

  const json = await handleResponse(response);
  return json.data.emailVerified;
};

// Start impersonation session by system admin
export const impersonationStart = async (targetUserId: string) => {
  const response = await client.impersonation.start.$get({
    query: { targetUserId },
  });

  const json = await handleResponse(response);
  return json.success;
};

// Send a new verification email
export const sendVerificationEmail = async ({ tokenId, userId }: { tokenId?: string; userId?: string }) => {
  const response = await client['send-verification-email'].$post({
    json: { tokenId, userId },
  });

  await handleResponse(response);
};

// Send email to create a password
export const requestPasswordEmail = async (email: string) => {
  const response = await client['request-password'].$post({
    json: { email },
  });

  await handleResponse(response);
};

export type CreatePasswordProps = TokenType & { password: string };

// Create a password
export const createPassword = async ({ token, password }: CreatePasswordProps) => {
  const response = await client['create-password'][':token'].$post({
    param: { token },
    json: { password },
  });

  await handleResponse(response);
};

// Check token validation
export const checkToken = async ({ id, type }: { id: string; type: TokenModel['type'] }) => {
  const response = await client['check-token'][':id'].$post({
    param: { id },
    query: { type },
  });

  const json = await handleResponse(response);
  return json.data;
};

export interface AcceptOrgInviteProps {
  token: string;
}

// Accept an invitation
export const acceptOrgInvite = async ({ token }: AcceptOrgInviteProps) => {
  const response = await client['accept-invite'][':token'].$post({
    param: { token },
  });

  const json = await handleResponse(response);
  return json.data;
};

// Stop impersonation session, returning to user admin page
export const impersonationStop = () => client.impersonation.stop.$get();

export const signOut = () => client['sign-out'].$get();

export const getChallenge = async () => {
  const response = await client['passkey-challenge'].$get();
  const json = await handleResponse(response);
  return json;
};

type RegisterPasskeyProp = Parameters<(typeof client)['passkey-registration']['$post']>['0']['json'];

// Register a passkey for user
export const registerPasskey = async (data: RegisterPasskeyProp) => {
  const apiResponse = await client['passkey-registration'].$post({
    json: data,
  });
  const json = await handleResponse(apiResponse);
  return json.success;
};

type AuthWithPasskeyProp = Parameters<(typeof client)['passkey-verification']['$post']>['0']['json'];

// Authenticate user through passkey
export const authenticateWithPasskey = async (data: AuthWithPasskeyProp) => {
  const response = await client['passkey-verification'].$post({
    json: data,
  });

  const json = await handleResponse(response);
  return json.success;
};
