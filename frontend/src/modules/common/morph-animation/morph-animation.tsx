import { useEffect, useRef, useState } from 'react';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useLatestRef } from '~/hooks/use-latest-ref';
import { MorphRenderer, type MorphStamp, type MorphVariant } from '~/modules/common/morph-animation/renderer';
import { fragmentSource } from '~/modules/common/morph-animation/shader';
import { uiStore, useUIStore } from '~/modules/ui/ui-store';
import { cn } from '~/utils/cn';

interface MorphAnimationProps {
  /** `single` fills the container it is given (hero); `colony` positions itself as a fixed page background (auth) */
  variant?: MorphVariant;
  /** Grain cells across the canvas (default: 96); lower is chunkier */
  grid?: number;
  /** Clock scale (default: 0.7); 1 is the pace the piece was tuned at */
  speed?: number;
  /** Canvas margin around the shape (default: 1.2); below 1 it magnifies */
  overscan?: number;
  stamp?: MorphStamp;
  className?: string;
}

/** Generative mark animation on a transparent canvas; mount it lazily with a `null` Suspense fallback. */
export function MorphAnimation({ variant = 'single', grid = 96, speed = 0.7, overscan = 1.2, stamp = 'square', className }: MorphAnimationProps) {
  const mode = useUIStore((state) => state.mode);
  const isPhone = useBreakpointBelow('sm');
  // Reduced motion only: the component lazy-loads, so its fade-in keys on its own mount and always starts from transparent
  const [isFadedIn, setIsFadedIn] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<MorphRenderer | null>(null);
  const propsRef = useLatestRef({ grid, speed, overscan, stamp, isPhone });

  // fragmentSource in the deps only changes under HMR, where it forces a rebuild so shader edits apply live
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new MorphRenderer(canvas, variant);
    rendererRef.current = renderer;
    renderer.setDark(uiStore.getState().mode === 'dark');
    renderer.setGrid(propsRef.current.grid);
    renderer.setPhone(propsRef.current.isPhone);
    renderer.setOverscan(propsRef.current.overscan);
    renderer.setStamp(propsRef.current.stamp);
    renderer.setSpeed(propsRef.current.speed);

    const observer = new IntersectionObserver(([entry]) => renderer.setPaused(!entry.isIntersecting));
    observer.observe(canvas);

    renderer.start();
    const fadeFrame = requestAnimationFrame(() => setIsFadedIn(true));

    return () => {
      cancelAnimationFrame(fadeFrame);
      observer.disconnect();
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [variant, fragmentSource]);

  useEffect(() => {
    rendererRef.current?.setDark(mode === 'dark');
  }, [mode]);

  useEffect(() => {
    rendererRef.current?.setGrid(grid);
  }, [grid]);

  useEffect(() => {
    rendererRef.current?.setPhone(isPhone);
  }, [isPhone]);

  useEffect(() => {
    rendererRef.current?.setSpeed(speed);
  }, [speed]);

  useEffect(() => {
    rendererRef.current?.setOverscan(overscan);
  }, [overscan]);

  useEffect(() => {
    rendererRef.current?.setStamp(stamp);
  }, [stamp]);

  // The shader's entrance brings the piece in; under reduced motion the canvas crossfades while the shader opens at rest
  const canvas = (
    <canvas
      ref={canvasRef}
      className={cn(
        'size-full motion-reduce:opacity-0 motion-reduce:transition-opacity motion-reduce:duration-2000',
        isFadedIn && 'motion-reduce:opacity-100',
        className,
      )}
    />
  );
  if (variant !== 'colony') return canvas;

  // The shader's light theme is tuned for this low-opacity multiply layer
  return <div className="pointer-events-none fixed inset-0 opacity-20 mix-blend-multiply dark:mix-blend-normal">{canvas}</div>;
}
