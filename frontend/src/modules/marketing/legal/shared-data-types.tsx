import sharedDataTypes from '#json/shared-data-types.json';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/modules/ui/table';

function SharedDataTypes() {
  return (
    <Table title="Shared Data Types" className="mt-2">
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Purpose</TableHead>
          <TableHead>Data Categories</TableHead>
          <TableHead>Storage Location</TableHead>
          <TableHead>Retention Period</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sharedDataTypes.map((type) => (
          <TableRow key={type.slug}>
            <TableCell>{type.name}</TableCell>
            <TableCell className="whitespace-normal">{type.purpose}</TableCell>
            <TableCell className="whitespace-normal">{type.dataCategories.join(', ')}</TableCell>
            <TableCell className="whitespace-normal">{type.storageLocation}</TableCell>
            <TableCell className="whitespace-normal">{type.retentionPeriod}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default SharedDataTypes;
