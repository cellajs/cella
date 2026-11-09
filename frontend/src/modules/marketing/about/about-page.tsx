import { CopyIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
import { CopiedIcon } from '~/modules/common/copied-icon';
import { CountryFlag } from '~/modules/common/country-flag';
import { CallToAction } from '~/modules/marketing/about/call-to-action';
// import { Counters } from '~/modules/marketing/about/counters';
// import { FAQ } from '~/modules/marketing/about/faq';
import { Hero } from '~/modules/marketing/about/hero';
import { InfoCards } from '~/modules/marketing/about/info-cards';
// import { Pricing } from '~/modules/marketing/about/pricing';
import { Showcase } from '~/modules/marketing/about/showcase';
import '~/modules/marketing/about/glow-button.css';
import { AboutSection } from '~/modules/marketing/about/section';
import { Why } from '~/modules/marketing/about/why';
import { MarketingFooter } from '~/modules/marketing/footer';
import { InfoGrid } from '~/modules/marketing/info-grid';
import { stackItems } from '~/modules/marketing/marketing-config';
import { MarketingNav } from '~/modules/marketing/nav';
import { Button } from '~/modules/ui/button';
import { Input } from '~/modules/ui/input';

const aboutSectionIds = ['welcome', 'benefits', 'stack', 'integrations', 'showcase', 'call-to-action'];

const installCommand = 'pnpm create @cellajs/cella';

export function AboutPage() {
  const { t } = useTranslation();

  const { copyToClipboard, copied } = useCopyToClipboard();

  useScrollSpy(aboutSectionIds);

  return (
    <>
      <MarketingNav />

      <main className="focus:outline-hidden">
        <Hero title="about:hero.title" text="about:hero.text">
          <div className="flex flex-col items-center gap-5 lg:flex-row lg:gap-6">
            <div className="glow-button relative max-sm:hidden">
              <Input
                readOnly
                id="install-command"
                aria-label={t('c:install_command')}
                value={installCommand}
                className="bg-background ring-primary/10 focus-visible:ring-primary/20 focus:border-input-hover block h-14 w-96 rounded-full border border-transparent px-8 py-6 font-mono text-sm font-light ring-4 transition focus:outline-hidden lg:w-80"
              />
              {copied && (
                <div className="bg-background absolute top-2.5 right-2 left-8 rounded-full py-2 text-left font-mono text-sm">
                  {t('about:install_copied')}
                </div>
              )}

              <Button
                onClick={() => copyToClipboard(installCommand)}
                aria-label={t('c:copy')}
                size="icon"
                variant="ghost"
                className="absolute top-2 right-2 rounded-full"
              >
                <CopiedIcon copied={copied} icon={CopyIcon} />
              </Button>
            </div>

            <p className="text-foreground flex items-center gap-2.5 text-sm font-medium whitespace-nowrap">
              <span className="flex">
                {/* The mask's center is the EU flag's: 20px width - 6px overlap + 10px radius */}
                <CountryFlag
                  countryCode="ua"
                  alt=""
                  width={20}
                  height={20}
                  className="rounded-full mask-[radial-gradient(circle_at_24px_50%,transparent_11.5px,black_12px)] object-cover shadow-none"
                />
                <CountryFlag countryCode="eu" alt="" width={20} height={20} className="-ml-[6px] rounded-full object-cover shadow-none" />
              </span>
              {t('about:hero.built_in_europe')}
            </p>
          </div>
        </Hero>

        <AboutSection sectionId="benefits" title="about:features.title">
          <Why />
        </AboutSection>

        <AboutSection sectionId="stack" title="about:stack.title" text="about:stack.text" alternate>
          <InfoGrid
            namespace="stack"
            items={stackItems}
            image
            expandable
            tileClassName="bg-background"
            className="sm:grid-cols-2 md:auto-rows-fr md:grid-cols-3"
          />
        </AboutSection>

        <AboutSection sectionId="integrations" title="about:integrations.title" text="about:integrations.text">
          <InfoCards />
        </AboutSection>

        <AboutSection sectionId="showcase" title="about:showcase.title" text="about:showcase.text" alternate>
          <Showcase />
        </AboutSection>

        <AboutSection sectionId="call-to-action">
          <CallToAction />
        </AboutSection>

        {/* <AboutSection sectionId="counters" title="about:community.title" text="about:community.text" alternate>
            <Counters />
          </AboutSection> */}

        {/* <AboutSection sectionId="pricing" title="about:pricing.title" text="about:pricing.text">
            <Pricing />
          </AboutSection> */}

        {/* <AboutSection sectionId="faqs" title="about:faq.title" text="about:faq.text" alternate>
            <FAQ />
          </AboutSection> */}
      </main>
      <MarketingFooter />
    </>
  );
}
