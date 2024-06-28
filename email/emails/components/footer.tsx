import { Hr, Section, Text } from '@react-email/components';

import { config } from 'config';

export const Footer = ({ hrClassName = '' }: { hrClassName?: string }) => (
  <>
    <Hr className={hrClassName} />
    <Section className="text-[#6a737d]">
      <Text className="text-[.75rem] leading-[1.13rem]">
        {config.name}
        <br />
        {config.company.streetAddress}
        <br />
        {config.company.city}
        <br />
        {config.company.country}, {config.company.postcode}
      </Text>
    </Section>
  </>
);
