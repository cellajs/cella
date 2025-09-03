import PasskeyOption from '~/modules/auth/passkey-option';

export const Confirm2FA = () => {
  return <PasskeyOption actionType="two_factor" authStep="signIn" />;
};
