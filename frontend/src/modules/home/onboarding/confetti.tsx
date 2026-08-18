import confetti from 'canvas-confetti';
import { useEffect, useRef } from 'react';

interface ConfettiProps {
  fire?: boolean; // Triggers a confetti burst on change to true
  options?: confetti.Options;
}

export function Confetti({ fire, options }: ConfettiProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const confettiInstance = useRef<confetti.CreateTypes | null>(null);

  useEffect(() => {
    if (canvasRef.current) {
      confettiInstance.current = confetti.create(canvasRef.current, {
        resize: true,
        useWorker: true,
      });
    }

    return () => {
      confettiInstance.current?.reset();
    };
  }, []);

  useEffect(() => {
    if (fire && confettiInstance.current) {
      confettiInstance.current({
        ...options,
        spread: 200,
        origin: { y: 0.45 },
        particleCount: 200,
        startVelocity: 25,
      });
    }
  }, [fire, options]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
    />
  );
}
