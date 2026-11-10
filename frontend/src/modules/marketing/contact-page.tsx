import { useTranslation } from 'react-i18next';
import { ContactForm } from '~/modules/common/contact-form/contact-form';
import { ContactMethodRows, contactMethods, isWebPage } from '~/modules/common/contact-form/contact-methods';
import { ExternalArrow } from '~/modules/marketing/external-arrow';
import { MarketingLayout } from '~/modules/marketing/layout';

export function ContactPage() {
  const { t } = useTranslation();

  return (
    <MarketingLayout title="c:contact_us">
      <div className="container pt-20 pb-16">
        <h2 className="mb-4 text-2xl font-semibold sm:text-3xl md:text-4xl">{t('c:leave_message')}</h2>
        <p className="text-muted-foreground mb-8 sm:text-lg">{t('c:contact_us.text')}</p>
        <ContactForm />
      </div>
      <div className="container mb-12">
        <ContactMethodRows className="sm:hidden" />
        <ul className="grid grid-cols-2 gap-y-10 pb-10 max-sm:hidden md:grid-cols-4">
          {contactMethods.map((method) => {
            const webPage = isWebPage(method.link);
            return (
              <li key={method.title} className="text-center">
                <div className="bg-accent/50 text-primary mx-auto mb-5 flex size-32 items-center justify-center rounded-full">
                  <method.icon className="size-12 stroke-1" />
                </div>
                <h3 className="mb-3 text-lg font-semibold">{t(method.title)}</h3>
                <p>
                  <a
                    href={method.link}
                    className="group/external-link focus-effect link-inline rounded-md p-0.5"
                    target={webPage ? '_blank' : undefined}
                    rel={webPage ? 'noreferrer' : undefined}
                  >
                    {method.textKey ? t(method.textKey) : method.text}
                    {webPage && <ExternalArrow />}
                  </a>
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    </MarketingLayout>
  );
}
