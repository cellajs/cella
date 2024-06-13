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
  return json.data;
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

export const signOut = () => apiClient.auth['sign-out'].$get();
