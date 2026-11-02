import { sharedDataTypes } from '~/modules/auth/legal/legal-config';
import { LegalFieldCell } from '~/modules/auth/legal/legal-field-cell';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/modules/ui/table';
import { cn } from '~/utils/cn';

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
