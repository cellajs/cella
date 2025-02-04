import { Link, useNavigate } from '@tanstack/react-router';

import { MarketingFooter } from '~/modules/marketing/footer';
import { MarketingNav } from '~/modules/marketing/nav';
import { Button, buttonVariants } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

import { ArrowDown, Check, Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
// import Counters from '~/modules/marketing/about/counters';
// import FAQ from '~/modules/marketing/about/faq';
import Features from '~/modules/marketing/about/features';
import { Hero } from '~/modules/marketing/about/hero';
import Integrations from '~/modules/marketing/about/integrations';
import Showcase from '~/modules/marketing/about/showcase';
// import Pricing from '~/modules/marketing/about/pricing';
import Why from '~/modules/marketing/about/why';

import CallToAction from '~/modules/marketing/about/call-to-action';
import '~/modules/marketing/about/glow-button.css';
import { Input } from '~/modules/ui/input';

interface AboutSectionProps {
  section: string;
  title?: string;
  text?: string;
  children?: React.ReactNode;
  alternate?: boolean; // Optional prop for background styling
}

const AboutSection = ({ title, text, section, children, alternate = false }: AboutSectionProps) => {
  const { t } = useTranslation();
  const backgroundClass = alternate ? 'bg-accent/40 dark:bg-transparent' : '';

  return (
    <section id={section} className={`container overflow-hidden max-w-none py-8 md:py-12 lg:py-24 ${backgroundClass}`}>
      <div className="mx-auto mb-12 flex max-w-[48rem] flex-col justify-center gap-4">
        {title && <h2 className="font-heading text-3xl font-semibold leading-[1.1] sm:text-center md:text-4xl">{t(title)}</h2>}
        {text && <p className="text-muted-foreground leading-normal sm:text-center sm:text-lg sm:leading-7">{t(text)}</p>}
      </div>
      {children}
    </section>
  );
};

const sectionIds = ['hero', 'why', 'features', 'integrations', 'showcase', 'call-to-action'];

const About = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { copyToClipboard, copied } = useCopyToClipboard();

  useScrollSpy({ sectionIds });

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
        <Hero key={'hero'} title="" badgeText="about:prerelease" subtitle="about:hero.subtitle" text="about:hero.text">
          <div className="glow-button mb-8 relative max-xs:hidden">
            <Input
              readOnly
              value="pnpm create @cellajs/cella"
              className="block w-96 py-6 h-14 px-8 font-light text-sm font-mono rounded-full border border-transparent bg-background ring-4 ring-primary/10 transition focus:border-gray-500 focus:outline-none focus-visible:ring-primary/20"
            />
            {copied && (
              <div className="absolute font-mono top-2.5 text-sm left-8 text-left bg-background right-2 py-2 rounded-full">copied! bon voyage 🚀</div>
            )}

            <Button
              onClick={() => copyToClipboard('pnpm create @cellajs/cella')}
              size="icon"
              variant="ghost"
              className="rounded-full absolute right-2 top-2"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </Button>
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

          {/* Showcase */}
          <AboutSection key={'showcase'} section="showcase" title="about:showcase" text="about:showcase.text">
            <Showcase />
          </AboutSection>

          {/* Call to Action */}
          <AboutSection key={'call-to-action'} section="call-to-action" alternate={true}>
            <CallToAction />
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
