/** @jsxImportSource @emotion/react */
import { css, keyframes } from '@emotion/react';
import round from 'lodash/round';
import { coinFlip, mapRange, rotate, rotationTransforms, shouldBeCircle } from './utils';

const ROTATION_SPEED_MIN = 200;
const ROTATION_SPEED_MAX = 800;
const CRAZY_PARTICLES_FREQUENCY = 0.1;
const CRAZY_PARTICLE_CRAZINESS = 0.25;
const BEZIER_MEDIAN = 0.5;

export interface IParticle {
  color: string;
  degree: number;
}

interface IParticlesProps {
  particles: IParticle[];
  duration: number;
  particleSize: number;
  force: number;
  height: number | string;
  width: number;
}

const rotationKeyframes = rotationTransforms.map((xyz) =>
  keyframes({
    '50%': { transform: `rotate3d(${xyz.map((v) => v / 2).join()}, 180deg)` },
    '100%': { transform: `rotate3d(${xyz.join()}, 360deg)` },
  }),
);

const createConfettiKeyframes = (degrees: number[], height: number | string, width: number) => {
  const y = typeof height === 'string' ? height : `${height}px`;

  const xLandingPoints = degrees.map((degree) => {
    const landingPoint = mapRange(Math.abs(rotate(degree, 90) - 180), 0, 180, -width / 2, width / 2);
    return keyframes({
      to: { transform: `translateX(${landingPoint}px)` },
    });
  });

  const yAxis = keyframes({
    to: { transform: `translateY(${y})` },
  });

  return { yAxis, xLandingPoints };
};

const confettiStyle = (
  particle: IParticle,
  duration: number,
  force: number,
  size: number,
  xKeyframe: ReturnType<typeof keyframes>,
  yKeyframe: ReturnType<typeof keyframes>,
) => {
  const rotation = Math.round(Math.random() * (ROTATION_SPEED_MAX - ROTATION_SPEED_MIN) + ROTATION_SPEED_MIN);
  const rotationIndex = Math.round(Math.random() * (rotationTransforms.length - 1));
  const durationChaos = duration - Math.round(Math.random() * 1000);
  const shouldBeCrazy = Math.random() < CRAZY_PARTICLES_FREQUENCY;
  const isCircle = shouldBeCircle(rotationIndex);

  const x1 = shouldBeCrazy ? round(Math.random() * CRAZY_PARTICLE_CRAZINESS, 2) : 0;
  const x2 = x1 * -1;
  const x3 = x1;
  const x4 = round(Math.abs(mapRange(Math.abs(rotate(particle.degree, 90) - 180), 0, 180, -1, 1)), 4);

  const y1 = round(Math.random() * BEZIER_MEDIAN, 4);
  const y2 = round(Math.random() * force * (coinFlip() ? 1 : -1), 4);
  const y3 = BEZIER_MEDIAN;
  const y4 = round(Math.max(mapRange(Math.abs(particle.degree - 180), 0, 180, force, -force), 0), 4);

  return css`
    animation: ${xKeyframe} ${durationChaos}ms forwards cubic-bezier(${x1}, ${x2}, ${x3}, ${x4}),
      ${yKeyframe} ${durationChaos}ms forwards cubic-bezier(${y1}, ${y2}, ${y3}, ${y4});

    > div {
      width: ${isCircle ? size : Math.round(Math.random() * 4) + size / 2}px;
      height: ${isCircle ? size : Math.round(Math.random() * 2) + size}px;
      animation: ${rotationKeyframes[rotationIndex]} ${rotation}ms infinite linear;

      &:after {
        background-color: ${particle.color};
        ${isCircle && 'border-radius: 50%;'}
        content: '';
        display: block;
        width: 100%;
        height: 100%;
      }
    }
  `;
};

export const Confetti = ({ particles, duration, height, width, force, particleSize }: IParticlesProps) => {
  const { yAxis, xLandingPoints } = createConfettiKeyframes(
    particles.map((p) => p.degree),
    height,
    width,
  );

  return (
    <div
      id="confetti"
      css={{
        position: 'absolute',
        width: 0,
        height: 0,
      }}
    >
      {particles.map((particle, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
          key={i}
          css={confettiStyle(particle, duration, force, particleSize, xLandingPoints[i], yAxis)}
        >
          <div />
        </div>
      ))}
    </div>
  );
};
