import { useParams } from '@tanstack/react-router';
import PasskeyOption from '~/modules/auth/passkey-option';
import { Confirn2FARoute } from '~/routes/auth';

export const Confirm2FA = () => {
  const { token } = useParams({ from: Confirn2FARoute.id });

  return <PasskeyOption token={token} actionType="confirn2FA" />;
};
