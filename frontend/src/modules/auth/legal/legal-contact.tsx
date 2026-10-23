import { BuildingIcon } from 'lucide-react';
import { appConfig } from 'shared';
import { cn } from '~/utils/cn';

interface SupportEmailLinkProps {
  className?: string;
}

/** The support address as a mail link. */
export function SupportEmailLink({ className }: SupportEmailLinkProps) {
  const { supportEmail } = appConfig.company;

  return (
    <a className={className} href={`mailto:${supportEmail}`} target="_blank" rel="noreferrer">
      {supportEmail}
    </a>
  );
}

interface LegalContactProps {
  /** Leaves out the registration and VAT lines. */
  addressOnly?: boolean;
  className?: string;
}

export function LegalContact({ addressOnly = false, className }: LegalContactProps) {
  const { name, streetAddress, postcode, city, country, registration, vatNumber } = appConfig.company;

  return (
    <div className={cn('not-prose flex gap-6', className)}>
      <span className="flex flex-col items-center">
        <BuildingIcon className="mt-1" />
        <span className="mt-1 w-px grow bg-border" />
      </span>
      <ul>
        <li className="mb-2">
          <strong>{name}</strong>
        </li>
        <li>{streetAddress}</li>
        <li>
          {city}, {postcode}
        </li>
        <li>{country}</li>
        <li>
          <SupportEmailLink className="link-inline" />
        </li>
        {!addressOnly && <li>{registration}</li>}
        {!addressOnly && vatNumber && <li>VAT number: {vatNumber}</li>}
      </ul>
    </div>
  );
}
