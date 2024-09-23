import { Text } from 'jsx-email';

import { config } from 'config';

export const Footer = () => (
  <Text
    style={{
      color: '#6a737d',
      fontSize: '0.75rem',
      textAlign: 'center' as const,
      marginTop: '2.75rem',
    }}
  >
    {config.name}・{config.company.streetAddress}・{config.company.city}・{config.company.country}, {config.company.postcode}
  </Text>
);
