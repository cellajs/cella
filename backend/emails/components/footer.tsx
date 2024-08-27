import { Hr, Section, Text } from 'jsx-email';

import { config } from 'config';

export const Footer = ({ hrStyle = {} }: { hrStyle?: React.CSSProperties }) => (
  <>
    <Hr style={hrStyle} />
    <Section style={{ color: '#6a737d' }}>
      <Text style={{ fontSize: '.75rem', lineHeight: '1.13rem' }}>
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
