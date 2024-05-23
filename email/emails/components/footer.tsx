import { Hr, Section, Text } from '@react-email/components';

import { config } from 'config';
import { cn } from '../../../frontend/src/lib/utils';

export const Footer = ({ hrClassName = '' }: { hrClassName?: string }) => (
  <>
    <Hr className={cn('', hrClassName)} />
    <Section className="text-[#6a737d]">
      <Text className="text-[12px] leading-[18px]">
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
