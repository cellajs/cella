import { useTranslation } from 'react-i18next';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '~/modules/ui/accordion';

interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

const faqsData: FaqItem[] = [
  {
    id: 'production-ready',
    question: 'common:faq.question_1',
    answer: 'common:faq.answer_1',
  },
  {
    id: 'cella-vs-next',
    question: 'common:faq.question_2',
    answer: 'common:faq.answer_2',
  },
  {
    id: 'alternative-to-nextjs',
    question: 'common:faq.question_3',
    answer: 'common:faq.answer_3',
  },
  {
    id: 'cella-made-in-europe',
    question: 'common:faq.question_4',
    answer: 'common:faq.answer_4',
  },
];

const FAQ = () => {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-[48rem]">
      <Accordion type="single" className="w-full" collapsible>
        {faqsData.map((faq) => (
          <AccordionItem key={faq.id} value={faq.id}>
            <AccordionTrigger>
              <span className="text-lg">{t(faq.question)}</span>
            </AccordionTrigger>
            <AccordionContent>
              <span className="text-lg font-light">{t(faq.answer)}</span>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
};

export default FAQ;
