import { Link, useNavigate } from '@tanstack/react-router';

import { MarketingFooter } from '~/modules/marketing/footer';
import { MarketingNav } from '~/modules/marketing/nav';
import { buttonVariants } from '~/modules/ui/button';
import { cn } from '~/utils/utils';

import { ArrowDown, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
import { WaitListForm } from '~/modules/common/wait-list-form';
// import Counters from '~/modules/marketing/about/counters';
import FAQ from '~/modules/marketing/about/faq';
// import Features from '~/modules/marketing/about/features';
import { Hero } from '~/modules/marketing/about/hero';
import Pricing from '~/modules/marketing/about/pricing';
// import Integrations from '~/modules/marketing/about/integrations';
import Why from '~/modules/marketing/about/why';

import { config } from 'config';
import { useState } from 'react';
import '~/modules/marketing/about/glow-button.css';

interface AboutSectionProps {
  title: string;
  text: string;
  section: string;
  children?: React.ReactNode;
  alternate?: boolean; // Optional prop for background styling
}

const AboutSection = ({ title, text, section, children, alternate = false }: AboutSectionProps) => {
  const { t } = useTranslation();
  const backgroundClass = alternate ? 'bg-accent/40 dark:bg-transparent' : '';

  return (
    <section id={section} className={`container overflow-hidden max-w-none py-8 md:py-12 lg:py-24 ${backgroundClass}`}>
      <div className="mx-auto mb-12 flex max-w-[48rem] flex-col justify-center gap-4">
        <h2 className="font-heading text-3xl font-semibold leading-[1.1] sm:text-center md:text-4xl">{t(title)}</h2>
        <p className="text-muted-foreground leading-normal sm:text-center sm:text-lg sm:leading-7">{t(text)}</p>
      </div>
      {children}
    </section>
  );
};

const sectionIds = ['hero', 'product', 'pricing', 'faqs'];

const About = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [joinedToWaitlist, setJoinedToWaitlist] = useState(false);

  useScrollSpy({ sectionIds, autoUpdateHash: true });

  // If the hash already matches but the user is not at the section, clear and re-set the hash
  const handleMismatch = (target: string) => {
    if (location.hash !== `#${target}`) return;
    navigate({ hash: '', replace: true });
    setTimeout(() => {
      navigate({ hash: target, replace: true });
    }, 1);
  };

  return (
    <>
      <MarketingNav onHandleMismatch={handleMismatch} />

      <div className="container max-w-none px-0">
        {/* Hero landing */}
        <Hero key={'hero'} title="about:title_1" subtitle="about:subtitle" text="about:text_1">
          {joinedToWaitlist ? (
            <span className="flex gap-2 justify-between items-center border-2 rounded-full px-4 py-3.5 ring-4 ring-primary/5 border-success">
              <Check className="text-success w-8" size={20} />
              <span className="opacity-60">{t('common:in_waitlist', { appName: config.name })}</span>
            </span>
          ) : (
            <WaitListForm
              email=""
              buttonContent={`${t('common:join')} ${t('common:waitlist')}`}
              emailField
              callback={() => setJoinedToWaitlist(true)}
            />
          )}

          <Link
            to="/about"
            replace
            hash="product"
            onClick={() => handleMismatch('product')}
            className={cn('mt-8', buttonVariants({ variant: 'ghost', size: 'lg' }))}
            aria-label="Read more"
          >
            <span className="font-light">{t('about:why')}</span>
            <ArrowDown size={16} className="ml-2 animate-bounce" />
          </Link>
        </Hero>

        <div className="my-12">
          {/* Why this product */}
          <AboutSection key={'product'} section="product" title="about:title_2" text="about:text_2">
            <Why />
          </AboutSection>

          {/* Features */}
          {/* <AboutSection key={'features'} section="features" title="about:title_3" text="about:text_3" alternate={true}>
            <Features />
          </AboutSection> */}

          {/* Integrations */}
          {/* <AboutSection key={'integrations'} section="integrations" title="about:title_4" text="about:text_4">
            <Integrations />
          </AboutSection> */}

          {/* Pricing */}
          <AboutSection key={'pricing'} section="pricing" title="about:title_6" text="about:text_6">
            <Pricing />
          </AboutSection>

          {/* FAQs */}
          <AboutSection key={'faqs'} section="faqs" title="about:title_7" text="about:text_7" alternate={true}>
            <FAQ />
          </AboutSection>

          {/* Public counters */}
          {/* <AboutSection key={'counters'} section="counters" title="about:title_5" text="about:text_5">
            <Counters />
          </AboutSection> */}
        </div>
      </div>
      <MarketingFooter />
    </>
  );
};

export default About;
