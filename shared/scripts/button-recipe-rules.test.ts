import { describe, expect, it } from 'vitest';
import { offModelHover, restylesVariant } from './button-recipe-rules.ts';

describe('button recipe markers', () => {
  it('tells a color class from a size, width, layout or model state class under the same prefix', () => {
    const colors = ['bg-foreground/10', 'hover:bg-secondary', 'border-input', 'border-b-transparent', 'text-destructive', 'dark:text-[#fff]'];
    const others = ['bg-clip-padding', 'bg-cover', 'border-0', 'border-b-0', 'border-x', 'border-dashed', 'text-sm', 'text-2xl', 'text-left'];
    const modelStates = ['data-[active=true]:bg-accent', 'data-dropdowner-active:bg-muted', '[&_svg]:text-muted-foreground'];
    expect(colors.filter(restylesVariant)).toEqual(colors);
    expect([...others, ...modelStates].filter(restylesVariant)).toEqual([]);
  });

  it('marks a neutral hover off the model, and keeps the muted, accent and table row recipes', () => {
    const off = ['hover:bg-accent/50', 'sm:hover:bg-foreground/8', 'group-hover/row:bg-accent/40'];
    const on = ['hover:bg-muted', 'hover:bg-accent', 'hover:bg-muted/50', 'dark:hover:bg-muted/50', 'bg-accent/50'];
    expect(off.filter(offModelHover)).toEqual(off);
    expect(on.filter(offModelHover)).toEqual([]);
  });
});
