import { Link } from '@tanstack/react-router';

import { PublicFooter } from '~/components/public-footer';
import { PublicNav } from '~/components/public-nav';
import { buttonVariants } from '~/components/ui/button';
import { cn } from '~/lib/utils';

import { config } from 'config';
import { ArrowDown } from 'lucide-react';
import { useEffect } from 'react';
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
  const backgroundClass = alternateBackground ? 'bg-accent/40 dark:bg-transparent' : '';

  return (
    <section id={sectionId} className={`container overflow-hidden max-w-none py-8 md:py-12 lg:py-24 ${backgroundClass}`}>
      <div className="mx-auto mb-12 flex max-w-[48rem] flex-col justify-center gap-4">
        <h2 className="font-heading text-3xl font-semibold leading-[1.1] sm:text-center md:text-4xl">{title}</h2>
        <p className="text-muted-foreground leading-normal sm:text-center sm:text-lg sm:leading-7">{description}</p>
      </div>
      {children}
    </section>
  );
};

const About = () => {
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
        <Hero
          key={'hero'}
          title="A no-nonsense & intuitive"
          subtitle="TypeScript template"
          description="Cella is open source and puts libraries first. Build your new web app as part of a single stack community."
        >
          <div className="mb-8">
            <a href={config.company.githubUrl} className={cn(buttonVariants({ variant: 'glow', size: 'xl' }))} aria-label="Get started">
              Get started on Github
            </a>
          </div>
          <Link to="/about" hash="why" className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }))} aria-label="Read more">
            <span className="font-light">Read why we built Cella</span>
            <ArrowDown size={16} className="ml-2 animate-bounce" />
          </Link>
        </Hero>

        <div className="my-12">
          {/* Why this product */}
          <AboutSection
            key={'why'}
            sectionId="why"
            title="Raison d'être"
            description="We didn't want another framework. Why not just a comprehensive template?"
          >
            <Why />
          </AboutSection>

          {/* Features */}
          <AboutSection
            key={'features'}
            sectionId="features"
            title="Vollgepackt mit Funktionen"
            description="Best-in-class libraries that fit well together. Each with proper documentation."
            alternateBackground={true}
          >
            <Features />
          </AboutSection>

          {/* Integrations */}
          <AboutSection
            key={'integrations'}
            sectionId="integrations"
            title="Integrations"
            description="Powerful yet flexible integrations so you can focus on building your product."
          >
            <Integrations />
          </AboutSection>

          {/* Public counters */}
          {/* <AboutSection
            key={'counters'}
            sectionId="counters"
            title="Faster together"
            description="Cella is open source and wants to work together with other OS projects & teams."
            alternateBackground={true}
          >
            <Counters />
          </AboutSection> */}

          {/* Pricing */}
          <AboutSection
            key={'pricing'}
            sectionId="pricing"
            title="Pricing (conceptual)"
            description="How to build a dedicated & sustainable community around CellaJS? Membership perhaps."
          >
            <Pricing />
          </AboutSection>

          {/* FAQs */}
          {/* <AboutSection
            key={'faqs'}
            sectionId="faqs"
            title="FAQs"
            description="Frequently asked questions. Is your question not included? Please reach out to us."
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
