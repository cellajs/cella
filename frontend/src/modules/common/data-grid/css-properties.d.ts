import 'react';

declare module 'react' {
  interface CSSProperties {
    '--rdg-color'?: string;
    '--rdg-border-color'?: string;
    '--rdg-background-color'?: string;
    '--rdg-header-background-color'?: string;
    '--rdg-row-hover-background-color'?: string;
    '--rdg-row-selected-background-color'?: string;
    '--rdg-row-selected-hover-background-color'?: string;
    '--rdg-selection-color'?: string;
    '--rdg-font-size'?: string;
    '--rdg-cell-frozen-box-shadow'?: string;
    '--rdg-header-row-height'?: string | number;
    '--rdg-row-height'?: string | number;
    '--rdg-grid-row-start'?: string | number;
    '--rdg-scrollbar-size'?: string;
    '--rdg-scroll-height'?: string;
    '--rdg-scroll-width'?: string;
    '--rdg-frozen-left'?: string;
    '--rdg-frozen-right'?: string;
    '--rdg-template-columns'?: string;
  }
}
