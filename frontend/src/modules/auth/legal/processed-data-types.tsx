import { sharedDataTypes } from '~/modules/auth/legal/legal-config';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/modules/ui/table';

export function ProcessedDataTypes() {
  return (
    <Table title="Processed data" className="mt-2">
      <TableHeader>
        <TableRow>
          <TableHead>Data</TableHead>
          <TableHead>Purpose</TableHead>
          <TableHead>Legal basis</TableHead>
          <TableHead>Retention</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sharedDataTypes.map((type) => (
          <TableRow key={type.slug}>
            <TableCell className="whitespace-normal">
              <strong>{type.name}</strong>
              <br />
              <span className="text-muted-foreground">{type.dataCategories.join(', ')}</span>
            </TableCell>
            <TableCell className="whitespace-normal">{type.purpose}</TableCell>
            <TableCell className="whitespace-normal first-letter:uppercase">{type.legalBasis}</TableCell>
            <TableCell className="whitespace-normal">{type.retentionPeriod}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
