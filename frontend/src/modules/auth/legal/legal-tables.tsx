import { CornerDownRightIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { sharedDataTypes, subprocessors } from '~/modules/auth/legal/legal-config';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/modules/ui/table';
import { cn } from '~/utils/cn';

interface LegalFieldCellProps extends ComponentProps<typeof TableCell> {
  label: string;
}

/**
 * A cell that stacks under its row's name on a phone, where it names itself because the column header is out of view.
 * A legal table states its roles because `display: block` can strip them.
 */
function LegalFieldCell({ label, className, children, ...props }: LegalFieldCellProps) {
  return (
    <TableCell role="cell" className={cn('whitespace-normal max-sm:mt-1 max-sm:block max-sm:p-0', className)} {...props}>
      <span className="group-label mr-0.5 sm:hidden">
        <CornerDownRightIcon className="mr-1 inline size-3.5 align-[-0.125em]" />
        {label}
      </span>{' '}
      {children}
    </TableCell>
  );
}

export function Subprocessors() {
  return (
    <Table title="Subprocessors" role="table" className="mt-2 max-sm:block">
      <TableHeader role="rowgroup" className="max-sm:sr-only">
        <TableRow role="row">
          <TableHead role="columnheader">Company</TableHead>
          <TableHead role="columnheader">Country</TableHead>
          <TableHead role="columnheader">Services</TableHead>
          <TableHead role="columnheader">Personal data</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody role="rowgroup" className="max-sm:block">
        {subprocessors.map(({ slug, name, legalName, website, country, servicesProvided, categoriesOfPersonalData }) => (
          <TableRow key={slug} role="row" className="max-sm:flex max-sm:flex-wrap max-sm:justify-between max-sm:gap-x-3 max-sm:py-3.5">
            <TableCell role="cell" className="max-sm:p-0">
              <a href={website} target="_blank" rel="noreferrer">
                {legalName.includes(name) ? legalName : `${name} (${legalName})`}
              </a>
            </TableCell>
            <TableCell role="cell" className="max-sm:text-muted-foreground whitespace-normal max-sm:p-0">
              {country}
            </TableCell>
            <LegalFieldCell label="Services" className="max-sm:w-full">
              {servicesProvided.join(', ')}
            </LegalFieldCell>
            <LegalFieldCell label="Personal data" className="max-sm:w-full">
              {categoriesOfPersonalData.join(', ')}
            </LegalFieldCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function ProcessedDataTypes() {
  return (
    <Table title="Processed data" role="table" className="mt-2 max-sm:block">
      <TableHeader role="rowgroup" className="max-sm:sr-only">
        <TableRow role="row">
          <TableHead role="columnheader">Data</TableHead>
          <TableHead role="columnheader">Purpose</TableHead>
          <TableHead role="columnheader">Legal basis</TableHead>
          <TableHead role="columnheader">Retention</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody role="rowgroup" className="max-sm:block">
        {sharedDataTypes.map((type) => (
          <TableRow key={type.slug} role="row" className="max-sm:block max-sm:py-3.5">
            <TableCell role="cell" className="whitespace-normal max-sm:block max-sm:p-0">
              <strong>{type.name}</strong>
              <br />
              <span className="text-muted-foreground">{type.dataCategories.join(', ')}</span>
            </TableCell>
            <LegalFieldCell label="Purpose">{type.purpose}</LegalFieldCell>
            <LegalFieldCell label="Legal basis" className="first-letter:uppercase">
              {type.legalBasis}
            </LegalFieldCell>
            <LegalFieldCell label="Retention">
              {type.retentionPeriod.map((line) => (
                <span key={line} className={cn(type.retentionPeriod.length > 1 && 'block')}>
                  {line}
                </span>
              ))}
            </LegalFieldCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
