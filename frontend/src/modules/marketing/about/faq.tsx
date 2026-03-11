import { Link } from '@tanstack/react-router';
import { Trans, useTranslation } from 'react-i18next';
import { faqsData } from '~/modules/marketing/marketing-config';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '~/modules/ui/accordion';

export function FAQ() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-3xl">
      <Accordion className="w-full">
        {faqsData.map((faq, index) => {
          const question = `about:faq.question_${index + 1}`;
          const answer = `about:faq.answer_${index + 1}`;

          return (
            <AccordionItem key={faq.id} value={faq.id}>
              <AccordionTrigger className="px-3 text-xl text-left">{t(question)}</AccordionTrigger>
              <AccordionContent className="px-3 pb-8 text-lg font-light">
                <Trans
                  t={t}
                  i18nKey={answer}
                  components={{
                    Link: (
                      <Link
                        to={faq.link}
                        aria-label={`Visit ${faq.link}`}
                        target={faq.link?.startsWith('https:') ? '_blank' : '_self'}
                        className="underline underline-offset-2"
                      />
                    ),
                  }}
                />
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
