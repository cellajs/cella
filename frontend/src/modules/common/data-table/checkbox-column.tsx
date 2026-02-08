import { type Column, SelectColumn } from '~/modules/common/data-grid';

// biome-ignore lint/suspicious/noExplicitAny: any is used for compatibility with react-data-grid
export const CheckboxColumn: Column<any> & {
  visible: boolean;
} = {
  ...SelectColumn,
  key: 'checkbox-column',
  frozen: false,
  headerCellClass: 'flex items-center justify-center',
  cellClass: 'flex items-center justify-center',
  visible: window.innerWidth >= 640,
};
