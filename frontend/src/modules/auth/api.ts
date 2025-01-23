import { config } from 'config';
import { clientConfig, handleResponse } from '~/lib/api';
import { authHc } from '#/modules/auth/hc';

// Create Hono clients to make requests to the backend
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

// Check if email exists
export const checkEmail = async (email: string) => {
  const response = await client['check-email'].$post({
    json: { email },
  });

  const json = await handleResponse(response);
  return json.success;
};

export type VerifyEmailProps = TokenType & { resend?: boolean };

// Verify the user's email with token sent by email
export const verifyEmail = async ({ token, resend }: VerifyEmailProps) => {
  const response = await client['verify-email'].$post({
    json: { token },
    query: { resend: String(resend) },
  });

  await handleResponse(response);
};

export type SignInProps = Parameters<(typeof client)['sign-in']['$post']>['0']['json'];

// Sign in a user with email and password
export const signIn = async ({ email, password, token }: SignInProps) => {
  const response = await client['sign-in'].$post({
    json: { email, password, token },
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

// Send a verification email
export const sendVerificationEmail = async (email: string) => {
  const response = await client['send-verification-email'].$post({
    json: { email },
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

// Stop impersonation session, returning to user admin page
export const impersonationStop = () => client.impersonation.stop.$get();

export const signOut = () => client['sign-out'].$get();

export const getChallenge = async () => {
  const response = await client['passkey-challenge'].$get();
  const json = await handleResponse(response);
  return json;
};

type SetPasskeyProp = Parameters<(typeof client)['passkey-registration']['$post']>['0']['json'];

// Register a passkey for user
export const setPasskey = async (data: SetPasskeyProp) => {
  const apiResponse = await client['passkey-registration'].$post({
    json: data,
  });
  const json = await handleResponse(apiResponse);
  return json.success;
};

type AuthThroughPasskeyProp = Parameters<(typeof client)['passkey-verification']['$post']>['0']['json'];

// Authenticate user through passkey
export const authThroughPasskey = async (data: AuthThroughPasskeyProp) => {
  const response = await client['passkey-verification'].$post({
    json: data,
  });

  const json = await handleResponse(response);
  return json.success;
};
