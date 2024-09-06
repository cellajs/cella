import { Img } from 'jsx-email';

export const Logo = ({ logoSrc }: { logoSrc?: string }) => {
  return (
    <Img
      style={{
        borderRadius: '9999px',
        margin: '0 0 0 5.625rem',
      }}
      src={logoSrc}
      width="64"
      height="64"
    />
  );
};

export default Logo;
