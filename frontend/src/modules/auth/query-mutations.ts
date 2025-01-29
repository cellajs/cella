import { useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import { toast } from 'sonner';
import type { ApiError } from '~/lib/api';

import {
  type CreatePasswordProps,
  type SignInProps,
  type SignUpProps,
  type TokenType,
  type VerifyEmailProps,
  checkEmail,
  createPassword,
  signIn,
  signUp,
  signUpWithToken,
  verifyEmail,
} from '~/modules/auth/api';
import { authKeys } from '~/modules/auth/query';

export const useVerifyEmailMutation = () => {
  return useMutation<void, ApiError, VerifyEmailProps>({
    mutationKey: authKeys.verifyEmail(),
    mutationFn: verifyEmail,
  });
};

export const useResetPasswordMutation = () => {
  return useMutation<void, ApiError, CreatePasswordProps>({
    mutationKey: authKeys.resetPassword(),
    mutationFn: createPassword,
    onSuccess: () => toast.success(t('common:success.password_reset')),
  });
};

export const useCheckEmailMutation = () => {
  return useMutation<boolean, ApiError, string>({
    mutationKey: authKeys.checkEmail(),
    mutationFn: checkEmail,
  });
};

export const useSignInMutation = () => {
  return useMutation<boolean, ApiError, SignInProps>({
    mutationKey: authKeys.signIn(),
    mutationFn: signIn,
  });
};

export const useSignUpMutation = () => {
  return useMutation<boolean, ApiError, SignUpProps>({
    mutationKey: authKeys.signUp(),
    mutationFn: signUp,
  });
};

export const useSignUpWithTokenMutation = () => {
  return useMutation<boolean, ApiError, TokenType & SignUpProps>({
    mutationKey: authKeys.signUpWithToken(),
    mutationFn: signUpWithToken,
  });
};
