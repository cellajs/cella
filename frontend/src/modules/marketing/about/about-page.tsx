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
import { AboutSection } from '~/modules/marketing/about/section';
import { Input } from '~/modules/ui/input';

export type AboutSectionId = (typeof aboutSectionIds)[number];

const aboutSectionIds = ['hero', 'why', 'features', 'integrations', 'showcase', 'call-to-action'];

const AboutPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { copyToClipboard, copied } = useCopyToClipboard();

  useScrollSpy({ sectionIds: aboutSectionIds });

  return (
    <>
      <MarketingNav />

      <div className="container max-w-none px-0">
        {/* Hero landing */}
        <Hero key={'hero'} title="" badgeText="about:prerelease" subtitle="about:hero.subtitle" text="about:hero.text">
          <div className="glow-button mb-8 relative max-xs:hidden">
            <Input
              readOnly
              value="pnpm create @cellajs/cella"
              className="block w-80 sm:w-96 py-6 h-14 px-8 font-light text-sm font-mono rounded-full border border-transparent bg-background ring-4 ring-primary/10 transition focus:border-gray-500 focus:outline-hidden focus-visible:ring-primary/20"
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
            onClick={(e) => {
              // if (window.location.hash !== '#why') return;
              e.preventDefault();
              navigate({ to: '.', hash: 'top', replace: true });

              // TODO(BLOCKING) fix while Link component doesn't support hash scroll into view
              const anchor = document.getElementById('why');
              anchor?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

              setTimeout(() => {
                navigate({ hash: 'why', replace: true });
              }, 20);
            }}
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

export default AboutPage;
