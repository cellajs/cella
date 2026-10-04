import { FRAGMENT_SOURCE, VERTEX_SOURCE } from '~/modules/common/morph-animation/shader';

export type MorphVariant = 'single' | 'colony';

// The grain look tolerates a low render resolution, so touch devices get a lower cap to save battery
const MAX_PIXEL_RATIO = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches ? 1.25 : 1.75;
// The mark's true half-width is 0.0372; drawn a bit thicker here, which narrows the gap between the bands
const BAND_HALF_WIDTH = 0.05;
const WARP = 0.85;
const MELT = 0.8;

/** Colony choreography: one full 1 -> 2 -> 3 -> 5 -> 3 -> 2 -> 1 pass. */
const CYCLE_SECONDS = 60;

const UNIFORM_NAMES = [
  'uRes',
  'uTime',
  'uWarp',
  'uMelt',
  'uDark',
  'uPosA',
  'uPosB',
  'uPosE',
  'uTOffs',
  'uTOffE',
  'uG',
  'uCellScale',
  'uWidth',
  'uZoom',
  'uGrid',
  'uStamp',
] as const;
type UniformName = (typeof UNIFORM_NAMES)[number];

function eased(from: number, to: number, x: number) {
  const k = Math.min(1, Math.max(0, (x - from) / (to - from)));
  return k * k * (3 - 2 * k);
}

/**
 * Division choreography: four splits with their own eased ramps, the last two
 * staggered a few seconds apart so the colony grows organically: 1, 2, 3, 5 -
 * odd counts, never a mirrored grid. Returns each split's progress in 0..1.
 */
function splitProgress(t: number): [number, number, number, number] {
  const u = (t % CYCLE_SECONDS) / CYCLE_SECONDS;
  return [
    eased(0.055, 0.155, u) - eased(0.88, 0.96, u), // A splits off B (1 -> 2)
    eased(0.26, 0.355, u) - eased(0.775, 0.85, u), // B splits off C (2 -> 3)
    eased(0.44, 0.525, u) - eased(0.665, 0.745, u), // A splits off D (3 -> 4)
    eased(0.475, 0.565, u) - eased(0.635, 0.715, u), // C splits off E (4 -> 5, overlapping)
  ];
}

/**
 * Drives the morph shader on a transparent WebGL2 canvas: one fullscreen pass per
 * frame, no textures and no feedback buffers. The clock advances by `timeScale`,
 * which is how reduced motion works here: everything slows down, nothing freezes.
 * Browsers without WebGL2 get an empty transparent canvas.
 */
export class MorphRenderer {
  private canvas: HTMLCanvasElement;
  private variant: MorphVariant;
  private gl: WebGL2RenderingContext | null = null;
  private uniforms = {} as Record<UniformName, WebGLUniformLocation | null>;
  private frameHandle = 0;
  private lastNow = 0;
  private time = Math.random() * 1000;
  private timeScale = 1;
  private grid = 96;
  private stamp = 0;
  private overscan = 1.2;
  private dark = false;
  private paused = false;
  private disposed = false;

  private onContextLost = (event: Event) => {
    event.preventDefault();
    cancelAnimationFrame(this.frameHandle);
  };
  private onContextRestored = () => {
    this.initGl();
    this.resume();
  };

  constructor(canvas: HTMLCanvasElement, variant: MorphVariant) {
    this.canvas = canvas;
    this.variant = variant;
    canvas.addEventListener('webglcontextlost', this.onContextLost);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  start() {
    this.initGl();
    this.resume();
  }

  setDark(dark: boolean) {
    this.dark = dark;
    if (this.paused) this.drawFrame(0); // repaint the resting frame in the new theme
  }

  setTimeScale(scale: number) {
    this.timeScale = scale;
  }

  /** Pixel-grid density in cells across the canvas; lower is chunkier. */
  setGrid(grid: number) {
    this.grid = grid;
    if (this.paused) this.drawFrame(0);
  }

  /** Grain stamp: 0 draws squares, 1 draws small plus signs. */
  setStamp(stamp: number) {
    this.stamp = stamp;
    if (this.paused) this.drawFrame(0);
  }

  /** Margin factor around the shape: the canvas is this much wider than the blob, so warp and grain tails never clip. */
  setOverscan(overscan: number) {
    this.overscan = overscan;
    if (this.paused) this.drawFrame(0);
  }

  setPaused(paused: boolean) {
    if (this.paused === paused) return;
    this.paused = paused;
    if (paused) cancelAnimationFrame(this.frameHandle);
    else this.resume();
  }

  dispose() {
    // Never force-lose the context here: the canvas element survives a React
    // strict-mode remount, and a remount would then inherit a dead context.
    this.disposed = true;
    cancelAnimationFrame(this.frameHandle);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.gl = null;
  }

  private initGl() {
    const gl = this.canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      premultipliedAlpha: false,
      powerPreference: 'low-power',
    });
    if (!gl) return;
    this.gl = gl;

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return shader;
    };
    const vert = compile(gl.VERTEX_SHADER, VERTEX_SOURCE);
    const frag = compile(gl.FRAGMENT_SHADER, FRAGMENT_SOURCE);
    const program = gl.createProgram();
    if (!vert || !frag || !program) return;
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn(
        'morph-animation shader failed to link',
        `lost=${gl.isContextLost()}`,
        `program=${gl.getProgramInfoLog(program)}`,
        `vert=${gl.getShaderInfoLog(vert)}`,
        `frag=${gl.getShaderInfoLog(frag)}`,
      );
      this.gl = null;
      return;
    }
    gl.useProgram(program);
    for (const name of UNIFORM_NAMES) this.uniforms[name] = gl.getUniformLocation(program, name);

    // Resting single cell; the colony variant overwrites these every frame
    gl.uniform1f(this.uniforms.uWarp, WARP);
    gl.uniform1f(this.uniforms.uMelt, MELT);
    gl.uniform4f(this.uniforms.uPosA, 0, 0, 0, 0);
    gl.uniform4f(this.uniforms.uPosB, 0, 0, 0, 0);
    gl.uniform2f(this.uniforms.uPosE, 0, 0);
    gl.uniform4f(this.uniforms.uTOffs, 0, 0, 0, 0);
    gl.uniform1f(this.uniforms.uTOffE, 0);
    gl.uniform4f(this.uniforms.uG, 0, 0, 0, 0);
    gl.uniform1f(this.uniforms.uCellScale, 1);
    gl.uniform1f(this.uniforms.uWidth, BAND_HALF_WIDTH);
  }

  private resume() {
    if (this.disposed || !this.gl) return;
    this.lastNow = performance.now();
    cancelAnimationFrame(this.frameHandle);
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - this.lastNow) / 1000);
      this.lastNow = now;
      this.drawFrame(dt);
      if (!this.paused && !this.disposed) this.frameHandle = requestAnimationFrame(loop);
    };
    this.frameHandle = requestAnimationFrame(loop);
  }

  private fitCanvas(gl: WebGL2RenderingContext) {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    const width = Math.max(2, Math.round(rect.width * ratio));
    const height = Math.max(2, Math.round(rect.height * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
  }

  private drawFrame(dt: number) {
    const gl = this.gl;
    if (!gl) return;
    this.fitCanvas(gl);
    this.time += dt * this.timeScale;

    const u = this.uniforms;
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.uTime, this.time);
    gl.uniform1f(u.uDark, this.dark ? 1 : 0);
    gl.uniform1f(u.uGrid, this.grid);
    gl.uniform1i(u.uStamp, this.stamp);
    if (this.variant !== 'colony') gl.uniform1f(u.uZoom, this.overscan);

    if (this.variant === 'colony') {
      const [g1, g2, g3, g4] = splitProgress(this.time);
      const angle = 0.06 * this.time;
      const dir = (offset: number) => [Math.cos(angle + offset), Math.sin(angle + offset)];
      const [v1x, v1y] = dir(0);
      const [v2x, v2y] = dir(2.2);
      const [v3x, v3y] = dir(4.0);
      const [v4x, v4y] = dir(1.1);
      // Asymmetric family tree: unequal recoils, every split on its own axis
      const pAx = -0.17 * g1 * v1x - 0.08 * g3 * v3x;
      const pAy = -0.17 * g1 * v1y - 0.08 * g3 * v3y;
      const pBx = 0.19 * g1 * v1x - 0.1 * g2 * v2x;
      const pBy = 0.19 * g1 * v1y - 0.1 * g2 * v2y;
      const pCx = 0.19 * g1 * v1x + 0.15 * g2 * v2x - 0.08 * g4 * v4x;
      const pCy = 0.19 * g1 * v1y + 0.15 * g2 * v2y - 0.08 * g4 * v4y;
      const pDx = -0.17 * g1 * v1x + 0.16 * g3 * v3x;
      const pDy = -0.17 * g1 * v1y + 0.16 * g3 * v3y;
      gl.uniform4f(u.uPosA, pAx, pAy, pBx, pBy);
      gl.uniform4f(u.uPosB, pCx, pCy, pDx, pDy);
      gl.uniform2f(u.uPosE, pCx + 0.23 * g4 * v4x, pCy + 0.23 * g4 * v4y);
      // Daughters inherit the parent clock and drift from it with separation
      gl.uniform4f(u.uTOffs, -6 * g1 - 3 * g3, 6 * g1 - 3.5 * g2, 6 * g1 + 3.5 * g2 - 2.5 * g4, -6 * g1 + 4 * g3);
      gl.uniform1f(u.uTOffE, 6 * g1 + 3.5 * g2 + 3 * g4);
      gl.uniform4f(u.uG, g1, g2, g3, g4);
      const cellScale = (1 - 0.26 * g1) * (1 - 0.16 * g2) * (1 - 0.1 * g3) * (1 - 0.1 * g4);
      gl.uniform1f(u.uCellScale, cellScale);
      gl.uniform1f(u.uWidth, BAND_HALF_WIDTH * (0.7 + 0.3 * cellScale));
      gl.uniform1f(u.uZoom, this.overscan * (1 + 0.16 * g1 + 0.12 * g2 + 0.09 * g3 + 0.09 * g4));
    }

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
