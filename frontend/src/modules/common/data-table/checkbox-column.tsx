import { type Column, SelectColumn } from 'react-data-grid';

// biome-ignore lint/suspicious/noExplicitAny: any is used for compatibility with react-data-grid
const CheckboxColumn: Column<any> & {
  visible: boolean;
} = {
  ...SelectColumn,
  key: 'checkbox-column',
  frozen: false,
  headerCellClass: 'flex items-center justify-center',
  cellClass: 'flex items-center justify-center',
  visible: window.innerWidth >= 640,
};

export default CheckboxColumn;
