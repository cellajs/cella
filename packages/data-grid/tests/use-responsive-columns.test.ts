import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { useResponsiveColumns, type ResponsiveColumn } from '../src/hooks/use-responsive-columns';

interface TestRow {
  id: string;
  name: string;
  email: string;
  phone: string;
}

describe('useResponsiveColumns', () => {
  const testColumns: ResponsiveColumn<TestRow>[] = [
    { key: 'id', name: 'ID' },
    { key: 'name', name: 'Name' },
    { key: 'email', name: 'Email', minBreakpoint: 'md' },
    { key: 'phone', name: 'Phone', minBreakpoint: 'lg', showInDetail: true },
  ];

  beforeEach(() => {
    // Mock window.innerWidth
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024, // lg breakpoint
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should show all columns at large breakpoint', () => {
    const { result } = renderHook(() =>
      useResponsiveColumns({
        columns: testColumns,
        windowWidth: 1024, // lg
      })
    );

    expect(result.current.visibleColumns).toHaveLength(4);
    expect(result.current.hiddenColumns).toHaveLength(0);
    expect(result.current.currentBreakpoint).toBe('lg');
  });

  it('should hide lg columns at md breakpoint', () => {
    const { result } = renderHook(() =>
      useResponsiveColumns({
        columns: testColumns,
        windowWidth: 768, // md
      })
    );

    expect(result.current.visibleColumns).toHaveLength(3);
    expect(result.current.hiddenColumns).toHaveLength(1);
    expect(result.current.hiddenColumns[0].key).toBe('phone');
    expect(result.current.currentBreakpoint).toBe('md');
  });

  it('should hide md and lg columns at sm breakpoint', () => {
    const { result } = renderHook(() =>
      useResponsiveColumns({
        columns: testColumns,
        windowWidth: 640, // sm
      })
    );

    expect(result.current.visibleColumns).toHaveLength(2);
    expect(result.current.hiddenColumns).toHaveLength(2);
    expect(result.current.currentBreakpoint).toBe('sm');
  });

  it('should handle xs breakpoint', () => {
    const { result } = renderHook(() =>
      useResponsiveColumns({
        columns: testColumns,
        windowWidth: 320, // xs
      })
    );

    expect(result.current.visibleColumns).toHaveLength(2);
    expect(result.current.currentBreakpoint).toBe('xs');
  });

  it('should handle xl breakpoint', () => {
    const { result } = renderHook(() =>
      useResponsiveColumns({
        columns: testColumns,
        windowWidth: 1280, // xl
      })
    );

    expect(result.current.visibleColumns).toHaveLength(4);
    expect(result.current.currentBreakpoint).toBe('xl');
  });

  it('should handle 2xl breakpoint', () => {
    const { result } = renderHook(() =>
      useResponsiveColumns({
        columns: testColumns,
        windowWidth: 1600, // 2xl
      })
    );

    expect(result.current.visibleColumns).toHaveLength(4);
    expect(result.current.currentBreakpoint).toBe('2xl');
  });

  it('should respect showInDetail: false', () => {
    const columnsWithHidden: ResponsiveColumn<TestRow>[] = [
      { key: 'id', name: 'ID' },
      { key: 'secret', name: 'Secret', minBreakpoint: 'lg', showInDetail: false },
    ];

    const { result } = renderHook(() =>
      useResponsiveColumns({
        columns: columnsWithHidden,
        windowWidth: 640, // sm - below lg
      })
    );

    expect(result.current.visibleColumns).toHaveLength(1);
    expect(result.current.hiddenColumns).toHaveLength(0); // showInDetail: false excludes it
  });

  it('should support custom breakpoints', () => {
    const { result } = renderHook(() =>
      useResponsiveColumns({
        columns: testColumns,
        windowWidth: 800,
        breakpoints: {
          xs: 0,
          sm: 500,
          md: 900, // Higher than default
          lg: 1200,
          xl: 1400,
          '2xl': 1600,
        },
      })
    );

    // At 800px with custom breakpoints, we're still at sm
    expect(result.current.currentBreakpoint).toBe('sm');
    // So md+ columns should be hidden
    expect(result.current.hiddenColumns.some(c => c.key === 'email')).toBe(true);
  });

  it('should handle maxBreakpoint', () => {
    const columnsWithMax: ResponsiveColumn<TestRow>[] = [
      { key: 'id', name: 'ID' },
      { key: 'mobile-only', name: 'Mobile Only', maxBreakpoint: 'sm' },
      { key: 'name', name: 'Name' },
    ];

    const { result: smallResult } = renderHook(() =>
      useResponsiveColumns({
        columns: columnsWithMax,
        windowWidth: 640, // sm
      })
    );

    expect(smallResult.current.visibleColumns).toHaveLength(3);

    const { result: largeResult } = renderHook(() =>
      useResponsiveColumns({
        columns: columnsWithMax,
        windowWidth: 768, // md
      })
    );

    expect(largeResult.current.visibleColumns).toHaveLength(2);
    expect(largeResult.current.hiddenColumns).toHaveLength(1);
  });
});
