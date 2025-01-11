import confetti from 'canvas-confetti';
import type React from 'react';
import { useEffect, useRef } from 'react';

interface ConfettiProps {
  fire?: boolean; // If true, triggers a confetti burst
  options?: confetti.Options; // Options for customizing confetti
}

export const Confetti: React.FC<ConfettiProps> = ({ fire, options }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const confettiInstance = useRef<confetti.CreateTypes | null>(null);

  useEffect(() => {
    if (canvasRef.current) {
      // Create a confetti instance tied to the canvas
      confettiInstance.current = confetti.create(canvasRef.current, {
        resize: true, // Adjusts to canvas size
        useWorker: true, // Improves performance
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

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }} />;
};
