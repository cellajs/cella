import { apiClient, handleResponse } from '.';

// Oath endpoints
export const githubSignInUrl = apiClient.auth.github.$url().href;
export const googleSignInUrl = apiClient.auth.google.$url().href;
export const microsoftSignInUrl = apiClient.auth.microsoft.$url().href;

// Sign up a user with the provided email and password
export const signUp = async ({ email, password, token }: { email: string; password: string; token?: string }) => {
  const response = await apiClient.auth['sign-up'].$post({
    json: { email, password, token },
  });

  const json = await handleResponse(response);
  return json.success;
};

// Check if email exists
export const checkEmail = async (email: string) => {
  const response = await apiClient.auth['check-email'].$post({
    json: { email },
  });

  const json = await handleResponse(response);
  return json.success;
};

// Verify the user's email with token sent by email
export const verifyEmail = async ({ token, resend }: { token: string; resend?: boolean }) => {
  const response = await apiClient.auth['verify-email'].$post({
    json: { token },
    query: { resend: String(resend) },
  });

  await handleResponse(response);
};

// Sign in a user with email and password
export const signIn = async ({ email, password, token }: { email: string; password: string; token?: string }) => {
  const response = await apiClient.auth['sign-in'].$post({
    json: { email, password, token },
  });

  const json = await handleResponse(response);
  return json.success;
};

// Impersonation sign in by user admin
export const impersonateSignIn = async (targetUserId: string) => {
  const response = await apiClient.auth['impersonation-sign-in'].$get({
    query: { targetUserId },
  });

  const json = await handleResponse(response);
  return json.success;
};

// Send a verification email
export const sendVerificationEmail = async (email: string) => {
  const response = await apiClient.auth['send-verification-email'].$post({
    json: { email },
  });

  await handleResponse(response);
};

// Send a reset password email
export const sendResetPasswordEmail = async (email: string) => {
  const response = await apiClient.auth['reset-password'].$post({
    json: { email },
  });

  await handleResponse(response);
};

// Reset the user's password
export const resetPassword = async ({ token, password }: { token: string; password: string }) => {
  const response = await apiClient.auth['reset-password'][':token'].$post({
    param: { token },
    json: { password },
  });

  await handleResponse(response);
};

// Impersonation sign out, returning to user admin page
export const impersonateSignOut = () => apiClient.auth['impersonation-sign-out'].$get();

export const signOut = () => apiClient.auth['sign-out'].$get();

export const getChallenge = async () => {
  const response = await apiClient.auth['passkey-challenge'].$get();
  const json = await handleResponse(response);
  return json;
};

export const setPasskey = async ({
  clientDataJSON,
  attestationObject,
  email,
}: {
  attestationObject: string;
  clientDataJSON: string;
  email: string;
}) => {
  const apiResponse = await apiClient.auth['passkey-registration'].$post({
    json: { attestationObject, clientDataJSON, email },
  });
  const json = await handleResponse(apiResponse);
  return json.success;
};

export const authThroughPasskey = async ({
  credentialId,
  clientDataJSON,
  authenticatorData,
  signature,
  email,
}: { credentialId: string; clientDataJSON: string; authenticatorData: string; signature: string; email: string }) => {
  const response = await apiClient.auth['verify-passkey'].$post({ json: { credentialId, clientDataJSON, authenticatorData, signature, email } });

  const json = await handleResponse(response);
  return json.success;
};

// Check if user have passkey
export const checkUserPasskey = async (email: string) => {
  const response = await apiClient.auth['check-passkey'].$post({ json: { email } });

  const json = await handleResponse(response);
  return json.success;
};
