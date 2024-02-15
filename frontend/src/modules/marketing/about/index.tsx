import { Link } from '@tanstack/react-router';

import { cn } from '~/lib/utils';
import { PublicFooter } from '~/modules/common/public-footer';
import { PublicNav } from '~/modules/common/public-nav';
import { buttonVariants } from '~/modules/ui/button';

import { config } from 'config';
import { ArrowDown } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
// import Counters from './counters';
// import FAQ from './faq';
import Features from './features';
import { Hero } from './hero';
import Integrations from './integrations';
import Pricing from './pricing';
import Why from './why';

interface AboutSectionProps {
  title: string;
  description: string;
  sectionId: string;
  children?: React.ReactNode;
  alternateBackground?: boolean; // Optional prop for background styling
}

const AboutSection = ({ title, description, sectionId, children, alternateBackground = false }: AboutSectionProps) => {
  const { t } = useTranslation();
  const backgroundClass = alternateBackground ? 'bg-accent/40 dark:bg-transparent' : '';

  return (
    <section id={sectionId} className={`container overflow-hidden max-w-none py-8 md:py-12 lg:py-24 ${backgroundClass}`}>
      <div className="mx-auto mb-12 flex max-w-[48rem] flex-col justify-center gap-4">
        <h2 className="font-heading text-3xl font-semibold leading-[1.1] sm:text-center md:text-4xl">{t(title)}</h2>
        <p className="text-muted-foreground leading-normal sm:text-center sm:text-lg sm:leading-7">{t(description)}</p>
      </div>
      {children}
    </section>
  );
};

const About = () => {
  const { t } = useTranslation();
  useEffect(() => {
    document.documentElement.classList.add('scroll-smooth');

    return () => {
      document.documentElement.classList.remove('scroll-smooth');
    };
  }, []);

  return (
    <>
      <PublicNav />

      <div className="container max-w-none px-0">
        {/* Hero landing */}
        <Hero key={'hero'} title="common:about.index.title_1" subtitle="TypeScript template" description="common:about.index.description_1">
          <div className="mb-8">
            <a href={config.company.githubUrl} className={cn(buttonVariants({ variant: 'glow', size: 'xl' }))} aria-label="Get started">
              {t('common:start.github.message')}
            </a>
          </div>
          <Link to="/about" hash="why" className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }))} aria-label="Read more">
            <span className="font-light">{t('common:about.index.why')}</span>
            <ArrowDown size={16} className="ml-2 animate-bounce" />
          </Link>
        </Hero>

        <div className="my-12">
          {/* Why this product */}
          <AboutSection key={'why'} sectionId="why" title="common:about.index.title_2" description="common:about.index.description_2">
            <Why />
          </AboutSection>

          {/* Features */}
          <AboutSection
            key={'features'}
            sectionId="features"
            title="common:about.index.title_3"
            description="common:about.index.description_3"
            alternateBackground={true}
          >
            <Features />
          </AboutSection>

          {/* Integrations */}
          <AboutSection
            key={'integrations'}
            sectionId="integrations"
            title="common:about.index.title_4"
            description="common:about.index.description_4"
          >
            <Integrations />
          </AboutSection>

          {/* Public counters */}
          {/* <AboutSection
            key={'counters'}
            sectionId="counters"
            title="common:about.index.title_5"
            description="common:about.index.description_5"
            alternateBackground={true}
          >
            <Counters />
          </AboutSection> */}

          {/* Pricing */}
          <AboutSection key={'pricing'} sectionId="pricing" title="common:about.index.title_6" description="common:about.index.description_6">
            <Pricing />
          </AboutSection>

          {/* FAQs */}
          {/* <AboutSection
            key={'faqs'}
            sectionId="faqs"
            title="common:about.index.title_7"
            description="common:about.index.description_7"
            alternateBackground={true}
          >
            <FAQ />
          </AboutSection> */}
        </div>
      </div>
      <PublicFooter />
    </>
  );
};

export default About;
