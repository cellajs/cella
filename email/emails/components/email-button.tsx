import { Section, Button } from '@react-email/components';

export const EmailButton = ({ ButtonText, href }: { ButtonText: string; href: string }) => (
  <Section className="my-[32px] text-center">
    <Button className="rounded bg-[#000000] px-5 py-3 text-center text-[12px] font-semibold text-white no-underline" href={href}>
      {ButtonText}
    </Button>
  </Section>
);
