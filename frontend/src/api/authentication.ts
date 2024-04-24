import { ApiError, authClient as client } from '.';

// Oath endpoints
export const githubSignInUrl = client['sign-in'].github.$url().href;
export const googleSignInUrl = client['sign-in'].google.$url().href;
export const microsoftSignInUrl = client['sign-in'].microsoft.$url().href;

// Sign up a user with the provided email and password
export const signUp = async ({ email, password, token }: { email: string; password: string; token?: string }) => {
  const response = await client['sign-up'].$post({
    json: { email, password, token },
  });

  const json = await response.json();
  if ('error' in json) throw new ApiError(json.error);
  return json.success;
};

// Check if email exists
export const checkEmail = async (email: string) => {
  const response = await client['check-email'].$post({
    json: { email },
  });

  const json = await response.json();
  if ('error' in json) throw new ApiError(json.error);
  return json.data;
};

// Verify the user's email with token sent by email
export const verifyEmail = async ({ token, resend }: { token: string; resend?: boolean }) => {
  const response = await client['verify-email'][':token'].$get({
    param: { token },
    query: { resend: String(resend) },
  });

  const json = await response.json();
  if ('error' in json) throw new ApiError(json.error);
  return;
};

// Sign in a user with email and password
export const signIn = async ({
  email,
  password,
  token,
}: {
  email: string;
  password: string;
  token?: string;
}) => {
  const response = await client['sign-in'].$post({
    json: { email, password, token },
  });

  const json = await response.json();
  if ('error' in json) throw new ApiError(json.error);
  return json.data;
};

// Send a verification email
export const sendVerificationEmail = async (email: string) => {
  const response = await client['send-verification-email'].$post({
    json: { email },
  });

  const json = await response.json();
  if ('error' in json) throw new ApiError(json.error);
  return;
};

// Send a reset password email
export const sendResetPasswordEmail = async (email: string) => {
  const response = await client['reset-password'].$post({
    json: { email },
  });

  const json = await response.json();
  if ('error' in json) throw new ApiError(json.error);
  return;
};

// Reset the user's password
export const resetPassword = async ({
  token,
  password,
}: {
  token: string;
  password: string;
}) => {
  const response = await client['reset-password'][':token'].$post({
    param: { token },
    json: { password },
  });

  const json = await response.json();
  if ('error' in json) throw new ApiError(json.error);
  return;
};

export const signOut = () => client['sign-out'].$get();
