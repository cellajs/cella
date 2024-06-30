import { Link as TanstackLink, type LinkProps as TanstackLinkProps } from '@tanstack/react-router';
import { ReactNode, type AnchorHTMLAttributes, type FC } from 'react';

type AnchorProps = AnchorHTMLAttributes<HTMLAnchorElement>;

type AsProps = {
  as?: 'a' | 'tanstack-link';
};

type LinkProps = {
  to: TanstackLinkProps['to'];
  children: ReactNode;
} & AsProps &
  Omit<TanstackLinkProps, 'to'>;

type Props = LinkProps & (({ as: 'a' } & AnchorProps) | ({ as: 'tanstack-link' } & Omit<TanstackLinkProps, 'to'>));

/**
 * @description
 * A wrapper around the tanstack Link component that allows you to use either a tanstack Link or an anchor tag.
 */
export const Link: FC<Props> = ({ to, children, as = 'tanstack-link', ...rest }) => {
  if (as === 'a') {
    const { hash, state, from, ...anchorProps } = rest as Props;
    return (
      <a href={typeof to === 'string' ? to : '#'} {...anchorProps}>
        {children}
      </a>
    );
  }

  return (
    <TanstackLink to={to} {...(rest as Omit<TanstackLinkProps, 'to'>)}>
      {children}
    </TanstackLink>
  );
};
