import { describe, expect, it } from 'vitest';
import { clampZoom, MAX_ZOOM, MIN_ZOOM, ZOOM_STEP } from '~/modules/attachment/render/image-zoom';

describe('clampZoom', () => {
  it('passes values inside the range through', () => {
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(1 + ZOOM_STEP)).toBeCloseTo(1.2);
  });

  it('stops at the floor so repeated zoom-out never hides the image', () => {
    let zoom = 1;
    for (let i = 0; i < 20; i++) zoom = clampZoom(zoom - ZOOM_STEP);
    expect(zoom).toBe(MIN_ZOOM);
    expect(clampZoom(0)).toBe(MIN_ZOOM);
    expect(clampZoom(-3)).toBe(MIN_ZOOM);
  });

  it('stops at the ceiling for wheel bursts', () => {
    expect(clampZoom(Math.exp(100))).toBe(MAX_ZOOM);
  });
});
