import { fragmentSource, vertexSource } from '~/modules/common/morph-animation/shader';

export type MorphVariant = 'single' | 'colony';
export type MorphStamp = 'square' | 'plus';

// The grain look tolerates a low render resolution, so touch devices get a lower cap to save battery
const maxPixelRatio = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches ? 1.25 : 1.75;
// The shader lays `grid * gridSpan` cells across the canvas's short side
const gridSpan = 1.25;
// Smaller than this in CSS pixels a grain reads as noise, not as a pixel by design, so a small canvas gets fewer, larger grains
const minGrainPx = 3;
// A phone shows the same grain smaller, so its minimum sits well above the size a desktop draws
const minGrainPxPhone = 6;
// The mark's true half-width is 0.0372; drawn a bit thicker here, which narrows the gap between the bands
const bandHalfWidth = 0.05;
const warp = 0.85;
const melt = 0.8;

/** Colony choreography: one full 1 -> 2 -> 3 -> 5 -> 3 -> 2 -> 1 pass. */
const cycleSeconds = 60;
/** Entrance length in real seconds, whatever the instance speed: the mark condenses out of a dusted frame. */
const enterSeconds = 2.4;
/** Reduced motion slows the piece to this fraction of its speed and skips the entrance; the piece never freezes. */
const reducedMotionSpeed = 0.2;

const uniformNames = [
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
  'uEnter',
] as const;
type UniformName = (typeof uniformNames)[number];

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
  const u = (t % cycleSeconds) / cycleSeconds;
  return [
    eased(0.055, 0.155, u) - eased(0.88, 0.96, u), // A splits off B (1 -> 2)
    eased(0.26, 0.355, u) - eased(0.775, 0.85, u), // B splits off C (2 -> 3)
    eased(0.44, 0.525, u) - eased(0.665, 0.745, u), // A splits off D (3 -> 4)
    eased(0.475, 0.565, u) - eased(0.635, 0.715, u), // C splits off E (4 -> 5, overlapping)
  ];
}

/** Drives the morph shader on a transparent WebGL2 canvas; without WebGL2 the canvas stays empty. */
export class MorphRenderer {
  private canvas: HTMLCanvasElement;
  private variant: MorphVariant;
  private gl: WebGL2RenderingContext | null = null;
  private uniforms = {} as Record<UniformName, WebGLUniformLocation | null>;
  private frameHandle = 0;
  private lastNow = 0;
  private time = Math.random() * 1000;
  private speed = 1;
  /** Clock value the piece is frozen at; `null` lets it run. */
  private stillTime: number | null = null;
  private timeScale = 1;
  private reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  private enter = 0;
  private grid = 96;
  private shortSide = 0;
  private minGrain = minGrainPx;
  private stamp = 0;
  private overscan = 1.2;
  private dark = false;
  private paused = false;
  private disposed = false;

  private handleContextLost = (event: Event) => {
    event.preventDefault();
    cancelAnimationFrame(this.frameHandle);
  };
  private handleContextRestored = () => this.start();
  private handleMotionChange = () => this.applyMotion();

  constructor(canvas: HTMLCanvasElement, variant: MorphVariant) {
    this.canvas = canvas;
    this.variant = variant;
    canvas.addEventListener('webglcontextlost', this.handleContextLost);
    canvas.addEventListener('webglcontextrestored', this.handleContextRestored);
    this.reducedMotionQuery.addEventListener('change', this.handleMotionChange);
  }

  start() {
    this.initGl();
    this.resume();
  }

  setDark(dark: boolean) {
    this.dark = dark;
    this.redrawStill();
  }

  setSpeed(speed: number) {
    this.speed = speed;
    this.applyMotion();
  }

  /** Freezes the piece at clock value `time`: the entrance plays from mount, seen or not, then the loop stops. `null` lets it run. */
  setStill(time: number | null) {
    this.stillTime = time;
    if (time !== null) this.time = time;
    this.applyMotion();
    this.resume();
  }

  /** A small canvas draws fewer cells than this: see `minGrainPx`. */
  setGrid(grid: number) {
    this.grid = grid;
    this.redrawStill();
  }

  /** A phone-sized viewport gets the larger minimum grain: see `minGrainPxPhone`. */
  setPhone(isPhone: boolean) {
    this.minGrain = isPhone ? minGrainPxPhone : minGrainPx;
    this.redrawStill();
  }

  setStamp(stamp: MorphStamp) {
    this.stamp = stamp === 'plus' ? 1 : 0;
    this.redrawStill();
  }

  /** Margin factor around the shape: the canvas is this much wider than the blob, so warp and grain tails never clip. */
  setOverscan(overscan: number) {
    this.overscan = overscan;
    this.redrawStill();
  }

  setPaused(paused: boolean) {
    if (this.paused === paused) return;
    this.paused = paused;
    if (!paused) this.resume();
    else if (this.stillTime === null) cancelAnimationFrame(this.frameHandle);
  }

  dispose() {
    // Never force-lose the context: the canvas element survives a strict-mode remount, which would then inherit a dead context
    this.disposed = true;
    cancelAnimationFrame(this.frameHandle);
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
    this.reducedMotionQuery.removeEventListener('change', this.handleMotionChange);
    this.gl = null;
  }

  private applyMotion() {
    const motionSpeed = this.speed * (this.reducedMotionQuery.matches ? reducedMotionSpeed : 1);
    this.timeScale = this.stillTime === null ? motionSpeed : 0;
    if (this.reducedMotionQuery.matches) this.enter = 1;
  }

  /** A still that has entered draws no frames of its own, so a change to its look draws one. */
  private redrawStill() {
    if (this.stillTime !== null) this.resume();
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
    const vert = compile(gl.VERTEX_SHADER, vertexSource);
    const frag = compile(gl.FRAGMENT_SHADER, fragmentSource);
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
    for (const name of uniformNames) this.uniforms[name] = gl.getUniformLocation(program, name);

    // Resting single cell; the colony variant overwrites these every frame
    gl.uniform1f(this.uniforms.uWarp, warp);
    gl.uniform1f(this.uniforms.uMelt, melt);
    gl.uniform4f(this.uniforms.uPosA, 0, 0, 0, 0);
    gl.uniform4f(this.uniforms.uPosB, 0, 0, 0, 0);
    gl.uniform2f(this.uniforms.uPosE, 0, 0);
    gl.uniform4f(this.uniforms.uTOffs, 0, 0, 0, 0);
    gl.uniform1f(this.uniforms.uTOffE, 0);
    gl.uniform4f(this.uniforms.uG, 0, 0, 0, 0);
    gl.uniform1f(this.uniforms.uCellScale, 1);
    gl.uniform1f(this.uniforms.uWidth, bandHalfWidth);
  }

  private resume() {
    if (this.disposed || !this.gl) return;
    this.lastNow = performance.now();
    cancelAnimationFrame(this.frameHandle);
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - this.lastNow) / 1000);
      this.lastNow = now;
      this.drawFrame(dt);
      // A still draws until it has entered, seen or not; a running piece draws while seen
      const keepDrawing = this.stillTime === null ? !this.paused : this.enter < 1;
      if (!this.disposed && keepDrawing) this.frameHandle = requestAnimationFrame(loop);
    };
    this.frameHandle = requestAnimationFrame(loop);
  }

  private fitCanvas(gl: WebGL2RenderingContext) {
    const rect = this.canvas.getBoundingClientRect();
    this.shortSide = Math.min(rect.width, rect.height);
    const ratio = Math.min(window.devicePixelRatio || 1, maxPixelRatio);
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
    // Advances on drawn frames only, so a running instance mounted off-screen enters when it scrolls into view
    this.enter = Math.min(1, this.enter + dt / enterSeconds);

    const u = this.uniforms;
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.uTime, this.time);
    gl.uniform1f(u.uDark, this.dark ? 1 : 0);
    gl.uniform1f(u.uGrid, Math.max(1, Math.min(this.grid, this.shortSide / (gridSpan * this.minGrain))));
    gl.uniform1i(u.uStamp, this.stamp);
    gl.uniform1f(u.uEnter, this.enter);

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
      gl.uniform1f(u.uWidth, bandHalfWidth * (0.7 + 0.3 * cellScale));
      gl.uniform1f(u.uZoom, this.overscan * (1 + 0.16 * g1 + 0.12 * g2 + 0.09 * g3 + 0.09 * g4));
    } else {
      gl.uniform1f(u.uZoom, this.overscan);
    }

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
