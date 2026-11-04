import { useEffect, useEffectEvent, useRef } from 'react';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { type MorphPalette, MorphRenderer, type MorphStamp, type MorphVariant } from '~/modules/common/morph-animation/renderer';
import { fragmentSource } from '~/modules/common/morph-animation/shader';
import { useUIStore } from '~/modules/ui/ui-store';
import { cn } from '~/utils/cn';

interface MorphAnimationProps {
  /** `colony` is a fixed page background; the others fill their container. */
  variant?: MorphVariant;
  /** Grain cells across the canvas. */
  grid?: number;
  /** Clock scale; 1 is the tuned pace. */
  speed?: number;
  /** Canvas margin around the shape; below 1 it magnifies. */
  overscan?: number;
  stamp?: MorphStamp;
  /** `violet` suits the marketing gradient, `brand` a plain page background. */
  palette?: MorphPalette;
  /** Clock value to hold, after condensing in on mount. */
  still?: number;
  /** With `still`: grain fizz while the shape holds, 0 to 1. */
  fizz?: number;
  className?: string;
}

/** Generative mark animation on a transparent canvas; mount it lazily with a `null` Suspense fallback. */
export function MorphAnimation({
  variant = 'single',
  grid = 96,
  speed = 0.7,
  overscan = 1.2,
  stamp = 'square',
  palette = 'violet',
  still,
  fizz = 0,
  className,
}: MorphAnimationProps) {
  const mode = useUIStore((state) => state.mode);
  const isPhone = useBreakpointBelow('sm');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<MorphRenderer | null>(null);

  // A new renderer starts from the current props; the effects below keep it in step after that
  const seed = useEffectEvent((renderer: MorphRenderer) => {
    renderer.setDark(mode === 'dark');
    renderer.setGrid(grid);
    renderer.setPhone(isPhone);
    renderer.setOverscan(overscan);
    renderer.setStamp(stamp);
    renderer.setPalette(palette);
    renderer.setSpeed(speed);
    renderer.setStill(still ?? null);
    renderer.setFizz(fizz);
  });

  // fragmentSource in the deps only changes under HMR, where it forces a rebuild so shader edits apply live
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new MorphRenderer(canvas, variant);
    rendererRef.current = renderer;
    seed(renderer);

    const observer = new IntersectionObserver(([entry]) => renderer.setPaused(!entry.isIntersecting));
    observer.observe(canvas);

    renderer.start();

    return () => {
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

  useEffect(() => {
    rendererRef.current?.setPalette(palette);
  }, [palette]);

  useEffect(() => {
    rendererRef.current?.setStill(still ?? null);
  }, [still]);

  useEffect(() => {
    rendererRef.current?.setFizz(fizz);
  }, [fizz]);

  // The shader's entrance brings the piece in; under reduced motion the canvas crossfades while the shader opens at rest
  const canvas = (
    <canvas
      ref={canvasRef}
      className={cn('size-full motion-reduce:transition-opacity motion-reduce:duration-2000 motion-reduce:starting:opacity-0', className)}
    />
  );
  if (variant !== 'colony') return canvas;

  // The shader's light theme is tuned for this low-opacity multiply layer
  return <div className="pointer-events-none fixed inset-0 opacity-20 mix-blend-multiply dark:mix-blend-normal">{canvas}</div>;
}
