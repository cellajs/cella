import { useTranslation } from 'react-i18next';
import { MarketingFooter } from './footer';
import { MarketingNav } from './nav';

export interface MarketingPageProps {
  title: string;
  children?: React.ReactNode;
  Link?: JSX.Element;
  FooterLink?: JSX.Element;
  AboutLink?: JSX.Element;
  LegalLinks?: JSX.Element;
}

const MarketingPage = ({ title, children, Link, FooterLink, AboutLink, LegalLinks }: MarketingPageProps) => {
  const { t } = useTranslation();

  return (
    <div>
      <MarketingNav NavItems={Link} />
      <div className="container max-w-none px-0">
        <section className="rich-gradient relative py-20 pb-8">
          <h1 className="mt-12 mb-4 max-w-[600px] px-4 mx-auto sm:w-full text-4xl text-center md:text-5xl">{t(title)}</h1>
        </section>

        {children}
      </div>
      <MarketingFooter FooterLink={FooterLink} AboutLink={AboutLink} LegalLinks={LegalLinks} />
    </div>
  );
};

export default MarketingPage;
