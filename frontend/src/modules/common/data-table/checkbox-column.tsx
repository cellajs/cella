import { type Column, SelectColumn } from '~/modules/common/data-grid';

// biome-ignore lint/suspicious/noExplicitAny: any is used for compatibility with react-data-grid
export const CheckboxColumn: Column<any> = {
  ...SelectColumn,
  key: 'checkbox-column',
  minBreakpoint: 'sm',
};
