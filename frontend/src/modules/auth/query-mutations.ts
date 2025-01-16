import { useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import { toast } from 'sonner';
import type { ApiError } from '~/lib/api';

import {
  type ResetPasswordProps,
  type SignInProps,
  type SignUpProps,
  type VerifyEmailProps,
  checkEmail,
  resetPassword,
  sendResetPasswordEmail,
  signIn,
  signUp,
  verifyEmail,
} from '~/modules/auth/api';
import { authKeys } from '~/modules/auth/query';
import { dialog } from '~/modules/common/dialoger/state';

export const useVerifyEmailMutation = () => {
  return useMutation<void, ApiError, VerifyEmailProps>({
    mutationKey: authKeys.verifyEmail(),
    mutationFn: verifyEmail,
  });
};

export const useResetPasswordMutation = () => {
  return useMutation<void, ApiError, ResetPasswordProps>({
    mutationKey: authKeys.resetPassword(),
    mutationFn: resetPassword,
    onSuccess: () => toast.success(t('common:success.password_reset')),
  });
};

export const useSendResetPasswordMutation = () => {
  return useMutation<void, ApiError, string>({
    mutationKey: authKeys.sendResetPassword(),
    mutationFn: sendResetPasswordEmail,
    onSuccess: () => {
      toast.success(t('common:success.reset_link_sent'));
      dialog.remove();
    },
    onError: () => document.getElementById('reset-email-field')?.focus(),
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
