import MarketingPage from 'frontend/src/modules/marketing/page';
import { FC, PropsWithChildren } from 'react';

type Props = PropsWithChildren;

const Layout: FC<Props> = ({ children }) => {
  return (
    <MarketingPage title="blog" as="a">
      <div className="mb-[350px]">{children}</div>
    </MarketingPage>
  );
};

export default Layout;
