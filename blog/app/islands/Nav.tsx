import { MarketingFooter } from 'frontend/src/modules/marketing/footer';
import { MarketingNav } from 'frontend/src/modules/marketing/nav';
import { FC, PropsWithChildren } from 'react';

type Props = PropsWithChildren;

const Layout: FC<Props> = ({ children }) => {
  return (
    <>
      <MarketingNav as="a" />

      {children}

      {/* TODO: `ReferenceError: location is not defined` needs to be resolved <MarketingFooter />*/}
    </>
  );
};

export default Layout;
