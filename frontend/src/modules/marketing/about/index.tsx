import { Link, useNavigate } from '@tanstack/react-router';

import { cn } from '~/lib/utils';
import { MarketingFooter } from '~/modules/marketing/footer';
import { MarketingNav } from '~/modules/marketing/nav';
import { buttonVariants } from '~/modules/ui/button';

import { config } from 'config';
import { ArrowDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
// import Counters from '~/modules/marketing/about/counters';
// import FAQ from '~/modules/marketing/about/faq';
import Features from '~/modules/marketing/about/features';
import { Hero } from '~/modules/marketing/about/hero';
import Integrations from '~/modules/marketing/about/integrations';
// import Pricing from '~/modules/marketing/about/pricing';
import Why from '~/modules/marketing/about/why';

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

const sectionIds = ['hero', 'why', 'features', 'integrations'];

const About = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

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
          <div className="max-sm:hidden mb-8">
            <a
              href={config.company.githubUrl}
              className={cn(
                'glow-button bg-background/95 !rounded-full relative hover:!bg-background active:bg-background',
                buttonVariants({ variant: 'ghost', size: 'xl' }),
              )}
              aria-label="Get started"
            >
              {t('about:start_github.text')}
            </a>
          </div>
          <Link
            to="/about"
            replace
            hash="why"
            onClick={() => handleMismatch('why')}
            className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }))}
            aria-label="Read more"
          >
            <span className="font-light">{t('about:why')}</span>
            <ArrowDown size={16} className="ml-2 animate-bounce" />
          </Link>
        </Hero>

        <div className="my-12">
          {/* Why this product */}
          <AboutSection key={'why'} section="why" title="about:title_2" text="about:text_2">
            <Why />
          </AboutSection>

          {/* Features */}
          <AboutSection key={'features'} section="features" title="about:title_3" text="about:text_3" alternate={true}>
            <Features />
          </AboutSection>

          {/* Integrations */}
          <AboutSection key={'integrations'} section="integrations" title="about:title_4" text="about:text_4">
            <Integrations />
          </AboutSection>

          {/* Public counters */}
          {/* <AboutSection key={'counters'} section="counters" title="about:title_5" text="about:text_5" alternate={true}>
            <Counters />
          </AboutSection> */}

          {/* Pricing */}
          {/* <AboutSection key={'pricing'} section="pricing" title="about:title_6" text="about:text_6">
            <Pricing />
          </AboutSection> */}

          {/* FAQs */}
          {/* <AboutSection key={'faqs'} section="faqs" title="about:title_7" text="about:text_7" alternate={true}>
            <FAQ />
          </AboutSection> */}
        </div>
      </div>
      <MarketingFooter />
    </>
  );
};

export default About;
