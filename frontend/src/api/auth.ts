import { config } from 'config';
import { authHc } from '#/modules/auth/hc';
import { clientConfig, handleResponse } from '.';

// Create Hono clients to make requests to the backend
export const client = authHc(config.backendUrl, clientConfig);

// Oath endpoints
export const githubSignInUrl = client.github.$url().href;
export const googleSignInUrl = client.google.$url().href;
export const microsoftSignInUrl = client.microsoft.$url().href;

// Sign up a user with the provided email and password
export const signUp = async ({ email, password, token }: { email: string; password: string; token?: string }) => {
  const response = await client['sign-up'].$post({
    json: { email, password, token },
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
  return json.data.hasPasskey;
};

// Verify the user's email with token sent by email
export const verifyEmail = async ({ token, resend }: { token: string; resend?: boolean }) => {
  const response = await client['verify-email'].$post({
    json: { token },
    query: { resend: String(resend) },
  });

  await handleResponse(response);
};

// Sign in a user with email and password
export const signIn = async ({ email, password, token }: { email: string; password: string; token?: string }) => {
  const response = await client['sign-in'].$post({
    json: { email, password, token },
  });

  const json = await handleResponse(response);
  return json.data;
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

// Send a reset password email
export const sendResetPasswordEmail = async (email: string) => {
  const response = await client['reset-password'].$post({
    json: { email },
  });

  await handleResponse(response);
};

// Reset the user's password
export const resetPassword = async ({ token, password }: { token: string; password: string }) => {
  const response = await client['reset-password'][':token'].$post({
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

export const setPasskey = async (data: SetPasskeyProp) => {
  const apiResponse = await client['passkey-registration'].$post({
    json: data,
  });
  const json = await handleResponse(apiResponse);
  return json.success;
};

type AuthThroughPasskeyProp = Parameters<(typeof client)['passkey-verification']['$post']>['0']['json'];

export const authThroughPasskey = async (data: AuthThroughPasskeyProp) => {
  const response = await client['passkey-verification'].$post({
    json: data,
  });

  const json = await handleResponse(response);
  return json.success;
};
