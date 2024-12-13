import range from 'lodash/range';
import * as React from 'react';
import { createPortal } from 'react-dom';
import { Confetti, type IParticle } from './confetti'; // Import the improved Confetti component

const FORCE = 0.5;
const SIZE = 12;
const HEIGHT = '120vh';
const WIDTH = 1000;
const PARTICLE_COUNT = 100;
const DURATION = 2200;
const COLORS = ['#FFC700', '#FF0000', '#2E3191', '#41BBC7'];

export interface ConfettiProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'ref'> {
  particleCount?: number;
  duration?: number;
  colors?: string[];
  particleSize?: number;
  force?: number;
  height?: number | string;
  width?: number;
  zIndex?: number;
  onComplete?: () => void;
}

const createParticles = (count: number, colors: string[]): IParticle[] => {
  const increment = 360 / count;
  return range(count).map((index) => ({
    color: colors[index % colors.length],
    degree: increment * index,
  }));
};

function ConfettiExplosion({
  particleCount = PARTICLE_COUNT,
  duration = DURATION,
  colors = COLORS,
  particleSize = SIZE,
  force = FORCE,
  height = HEIGHT,
  width = WIDTH,
  zIndex,
  onComplete,
  ...props
}: ConfettiProps) {
  const [origin, setOrigin] = React.useState<{ top: number; left: number }>();
  const particles = createParticles(particleCount, colors);

  const originRef = React.useCallback((node: HTMLDivElement) => {
    if (node) {
      const { top, left } = node.getBoundingClientRect();
      setOrigin({ top, left });
    }
  }, []);

  React.useEffect(() => {
    if (typeof onComplete === 'function') {
      const timeout = setTimeout(onComplete, duration);
      return () => clearTimeout(timeout);
    }
  }, [duration, onComplete]);

  return (
    <div ref={originRef} {...props}>
      {origin &&
        createPortal(
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', pointerEvents: 'none', zIndex }}>
            <div style={{ position: 'absolute', top: origin.top, right: -10 }}>
              <Confetti particles={particles} duration={duration} particleSize={particleSize} force={force} width={width} height={height} />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

export default ConfettiExplosion;
