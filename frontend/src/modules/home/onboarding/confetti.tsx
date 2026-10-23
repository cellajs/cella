import confetti from 'canvas-confetti';
import { useEffect, useRef } from 'react';

/** One confetti burst over the nearest positioned ancestor, on mount. */
export function Confetti() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const fireConfetti = confetti.create(canvasRef.current, { resize: true, useWorker: true });
    fireConfetti({ spread: 200, origin: { y: 0.45 }, particleCount: 200, startVelocity: 25 });
    return () => fireConfetti.reset();
  }, []);

  return <canvas ref={canvasRef} className="pointer-events-none absolute top-0 left-0 size-full" />;
}
