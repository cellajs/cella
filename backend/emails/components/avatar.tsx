import { config } from 'config';
import { Img } from 'jsx-email';

const productionUrl = config.productionUrl;

export const Avatar = ({ url, type = 'user' }: { url?: string | null; type?: 'user' | 'organization' }) => {
  if (!url && type === 'organization') url = `${productionUrl}/static/email/organization.png`;
  else if (!url) url = `${productionUrl}/static/email/user.png`;

  return (
    <Img
      style={{
        borderRadius: '9999px',
        margin: '0 0 0 5.625rem',
      }}
      src={url}
      width="64"
      height="64"
    />
  );
};

export default Avatar;
