import { useEffect, useRef, useState } from 'react';
import { MorphRenderer, type MorphVariant } from '~/modules/common/morph-animation/renderer';
import { FRAGMENT_SOURCE } from '~/modules/common/morph-animation/shader';
import { useUIStore } from '~/modules/ui/ui-store';
import { cn } from '~/utils/cn';

/**
 * Generative mark animation on a transparent canvas; mount it lazily with a
 * `null` Suspense fallback. `single` is one resting cell that fills its
 * container (hero). `colony` divides 1-2-3-5 and flows back together as the
 * auth page background: it lays itself out behind the page, so the auth
 * layout renders it bare and an app's own background decides its own look.
 * Pauses off-screen; `prefers-reduced-motion` slows the whole piece down, and
 * nothing ever freezes. `grid` is the pixel density in cells across the canvas
 * (lower is chunkier, higher is finer); `speed` scales the clock, 1 being the
 * pace the piece was tuned at.
 */
export function MorphAnimation({
  variant = 'single',
  grid = 96,
  speed = 0.7,
  overscan = 1.2,
  stamp = 'square',
  className,
}: {
  variant?: MorphVariant;
  grid?: number;
  speed?: number;
  overscan?: number;
  stamp?: 'square' | 'plus';
  className?: string;
}) {
  const mode = useUIStore((state) => state.mode);
  // The component lazy-loads, so the fade-in keys on its own mount: it always starts from transparent
  const [faded, setFaded] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<MorphRenderer | null>(null);
  const propsRef = useRef({ grid, speed, overscan, stamp });
  propsRef.current = { grid, speed, overscan, stamp };

  // FRAGMENT_SOURCE in the deps only changes under HMR, where it forces a rebuild so shader edits apply live
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new MorphRenderer(canvas, variant);
    rendererRef.current = renderer;
    renderer.setDark(useUIStore.getState().mode === 'dark');
    renderer.setGrid(propsRef.current.grid);
    renderer.setOverscan(propsRef.current.overscan);
    renderer.setStamp(propsRef.current.stamp === 'plus' ? 1 : 0);

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    /* reduced motion slows to a fifth of the instance speed; the piece never freezes */
    const applyMotion = () => renderer.setTimeScale(propsRef.current.speed * (reducedMotion.matches ? 0.2 : 1));
    applyMotion();
    reducedMotion.addEventListener('change', applyMotion);

    const observer = new IntersectionObserver(([entry]) => renderer.setPaused(!entry.isIntersecting));
    observer.observe(canvas);

    renderer.start();
    const fadeFrame = requestAnimationFrame(() => setFaded(true));

    return () => {
      cancelAnimationFrame(fadeFrame);
      reducedMotion.removeEventListener('change', applyMotion);
      observer.disconnect();
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [variant, FRAGMENT_SOURCE]);

  useEffect(() => {
    rendererRef.current?.setDark(mode === 'dark');
  }, [mode]);

  useEffect(() => {
    rendererRef.current?.setGrid(grid);
  }, [grid]);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    rendererRef.current?.setTimeScale(speed * (reduced ? 0.2 : 1));
  }, [speed]);

  useEffect(() => {
    rendererRef.current?.setOverscan(overscan);
  }, [overscan]);

  useEffect(() => {
    rendererRef.current?.setStamp(stamp === 'plus' ? 1 : 0);
  }, [stamp]);

  const canvas = <canvas ref={canvasRef} className={cn('size-full opacity-0 transition-opacity duration-2000', faded && 'opacity-100', className)} />;
  if (variant !== 'colony') return canvas;

  // The shader's light theme is tuned for this low-opacity multiply layer
  return <div className="pointer-events-none fixed inset-0 opacity-20 mix-blend-multiply dark:mix-blend-normal">{canvas}</div>;
}
