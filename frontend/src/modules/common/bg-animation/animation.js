let canvas = null;
let gl = null;
let texs = null;
let hash_tex = null;
let framebuffer = null;
let rescale_shader = null;
let render_shader = null;
let trace_shader = null;
let last_resolution = [0, 0];
let cell_color = [1, 0, 0];

// A placeholder function for renderTask when not provided
const NOOP = () => {};

/**
 * A class for managing WebGL rendering process, monitoring performance, and adjusting rendering behavior dynamically.
 */
class WebGLRenderer {
  /**
   * Creates an instance of WebGLRenderer.
   * @param {Function} renderTask - The function representing the rendering task.
   */
  constructor(renderTask) {
    // Rendering task
    this.renderTask = renderTask || NOOP;

    // The sync object used to synchronize with GPU commands.
    this.sync = null;

    // The start time of the current performance measurement.
    this.startTime = 0;

    // The number of cycles elapsed since monitoring started.
    this.cycles = 0;

    // The number of consecutive adjusted cycles within a range.
    // Each time a normal cycle occurs, this number decreases.
    this.adjustedCycles = 0;

    // The cycle after which the rendering starts.
    this.renderStartCycle = 60; // Default value: 60 cycles (adjust as needed).

    // The maximum acceptable time per frame (in milliseconds) for maintaining target frame rate.
    this.maxFrameTime = 16.67; // milliseconds (for 60 FPS)

    // The threshold for identifying a big lag (in adjusted cycles).
    this.bigLagThreshold = 50; // Threshold for identifying big lag (adjust as needed)

    // Timeout duration for adjusting frame rate (in milliseconds)
    this.adjustmentTimeoutDuration = 100; // Adjust timeout as needed

    // Timeout duration for checking sync (in milliseconds)
    this.checkTimeoutDuration = 1; // Adjust timeout as needed

    // Flag to indicate if the rendering loop is running
    this.isRunning = false;
  }

  /**
   * Starts the WebGL rendering process if not already running.
   */
  start() {
    if (!this.isRunning && gl) {
      this.isRunning = true;
      this.renderLoop();
    }
  }

  /**
   * Stops the WebGL rendering process.
   */
  stop() {
    this.isRunning = false;
  }

  /**
   * Checks if the WebGL context is available.
   * If not, stops the rendering process.
   */
  checkContext() {
    if (!gl && this.isRunning) {
      this.stop();
    }
  }

  /**
   * The main render loop.
   */
  renderLoop() {
    try {
      this.checkContext();
      if (!this.isRunning) return;

      this.sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      this.startTime = performance.now();
      if (this.cycles >= this.renderStartCycle) this.renderTask();
      this.checkSync();
    } catch (error) {
      console.error("Error in render loop:", error);
      this.stop();
    }
  }

  /**
   * Checks if the GPU commands have been completed and adjusts rendering behavior accordingly.
   */
  checkSync() {
    try {
      this.checkContext();
      if (!this.isRunning) return;

      const status = gl.clientWaitSync(this.sync, 0, 0);
      if (status === gl.CONDITION_SATISFIED || status === gl.ALREADY_SIGNALED) {
        const endTime = performance.now();
        const elapsedTime = endTime - this.startTime;

        // Delete the sync object at the end of the cycle
        gl.deleteSync(this.sync);

        if (elapsedTime > this.maxFrameTime) {
          // Big lag detected, switch to fallback mechanism
          if (this.adjustedCycles >= this.bigLagThreshold) {
            this.handlePerformanceFallback();
            return;
          }
          // Lag detected, adjust frame rate
          this.updateCycleCounters(true)
          this.adjustFrameRate();
        } else {
          // No lag, continue with requestAnimationFrame
          this.updateCycleCounters()
          this.requestNextFrame();
        }
      } else {
        // Not yet complete, continue checking
        setTimeout(() => this.checkSync(), this.checkTimeoutDuration);
      }
    } catch (error) {
      console.error("Error in checkSync:", error);
      this.stop();
    }
  }

  /**
   * Updates cycle counters after each frame.
   * @param {boolean} adjusted - Indicates if the cycle was adjusted due to lag.
   */
  updateCycleCounters(adjusted) {
    try {
      if (adjusted) {
        this.adjustedCycles++;
      } else if (this.adjustedCycles) {
        this.adjustedCycles--;
      }

      this.cycles++;
    } catch (error) {
      console.error("Error in finishedCycle:", error);
      this.stop();
    }
  }

  /**
   * Requests the next frame to be rendered.
   */
  requestNextFrame() {
    try {
      // Continue with next frame
      requestAnimationFrame(() => this.renderLoop());
    } catch (error) {
      console.error("Error in requestNextFrame:", error);
      this.stop();
    }
  }

  /**
   * Adjusts the frame rate or applies other optimizations based on detected lag.
   */
  adjustFrameRate() {
    try {
      // Lower frame rate or apply other optimizations
      // Example: reduce frame rate by setting a longer timeout
      setTimeout(() => this.requestNextFrame(), this.adjustmentTimeoutDuration);
    } catch (error) {
      console.error("Error in adjustFrameRate:", error);
      this.stop();
    }
  }

  /**
   * Handles the fallback mechanism when a big lag is detected.
   */
  handlePerformanceFallback() {
    try {
      // Switch to fallback mechanism
      // Example: switch to a static image or other fallback mechanism
      // Stops the WebGL rendering process.
      this.stop();
    } catch (error) {
      console.error("Error in handlePerformanceFallback:", error);
      this.stop();
    }
  }
}

let webGLRenderer = null;

const rand = (min_or_max, max) => (min_or_max ? (max ? min_or_max + (max - min_or_max) * Math.random() : min_or_max * Math.random()) : Math.random());
const normalize = (v) => {
  const mag = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  return v.map((e) => e / mag);
};
const rand_dir = () =>
  normalize([rand(-1, 1) + rand(-1, 1) + rand(-1, 1), rand(-1, 1) + rand(-1, 1) + rand(-1, 1), rand(-1, 1) + rand(-1, 1) + rand(-1, 1)]);
const cross = (v1, v2) => [v1[1] * v2[2] - v1[2] * v2[1], v1[2] * v2[0] - v1[0] * v2[2], v1[0] * v2[1] - v1[1] * v2[0]];
const distortion_dot_dir_1 = rand_dir();
const distortion_dot_dir_2 = normalize(cross(distortion_dot_dir_1, rand_dir()));
const distortion_push_dir_1 = normalize(cross(distortion_dot_dir_1, rand_dir()));
const distortion_push_dir_2 = distortion_dot_dir_1.map((e) => -e);
const distortion_power_1 = rand(0.1, 1);
const distortion_power_2 = rand(0.1, 1);
const circles = [];
for (let i = 0; i < 2000; i++) {
  const pos = [rand(0.0625 - 1, 1 - 0.0625), rand(0.0625 - 1, 1 - 0.0625)];
  let touch_dist = Math.min(1 - Math.abs(pos[0]), 1 - Math.abs(pos[1]));
  for (const circle of circles) {
    const dx = pos[0] - circle[0];
    const dy = pos[1] - circle[1];
    touch_dist = Math.min(touch_dist, Math.sqrt(dx * dx + dy * dy) - (0.00390625 + circle[2]));
  }
  if (touch_dist > 0.0625) {
    const radius = rand(Math.min(touch_dist, 0.0625), Math.min(touch_dist, 0.15));
    pos.push(radius);
    circles.push(pos);
  }
}
const create_shader = (vert, frag_source, uniform_names) => {
  const frag = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(frag, frag_source);
  gl.compileShader(frag);
  const shader = gl.createProgram();
  gl.attachShader(shader, vert);
  gl.attachShader(shader, frag);
  gl.linkProgram(shader);
  // biome-ignore lint/suspicious/noAssignInExpressions: <explanation>
  uniform_names.map((name) => (shader[name] = gl.getUniformLocation(shader, name)));
  return shader;
};
const create_tex = (width, height) => {
  const tex = gl.createTexture(gl.TEXTURE_2D);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32UI, width, height, 0, gl.RGBA_INTEGER, gl.UNSIGNED_INT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
};
const init = (c) => {
  canvas = c;
  gl = canvas.getContext('webgl2');
  const vert = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(
    vert,
    `#version 300 es
precision highp float;
precision highp usampler2D;
precision highp int;
void main()
{
  gl_Position = vec4(((gl_VertexID == 2) ? 3. : -1.), ((gl_VertexID == 1) ? 3. : -1.), 0.5, 1.);
}
`,
  );
  gl.compileShader(vert);
  rescale_shader = create_shader(
    vert,
    `#version 300 es
precision highp float;
precision highp usampler2D;
precision highp int;
uniform vec2 resolution;
uniform usampler2D tex;
out uvec4 frag_color;
void main()
{
  frag_color = texture(tex, (gl_FragCoord.xy / resolution));
}`,
    ['resolution', 'tex'],
  );
  window.rescale_shader = rescale_shader;
  render_shader = create_shader(
    vert,
    `#version 300 es
precision highp float;
precision highp usampler2D;
precision highp int;
uniform vec2 resolution;
uniform usampler2D tex;
uniform vec3 color;
out vec4 frag_color;
void main()
{
  frag_color = (mix(0., 1., (float(texture(tex, (gl_FragCoord.xy / resolution)).x) * 0.00000000023283064371)) * vec4(color, 1.));
}
`,
    ['resolution', 'tex', 'color'],
  );
  trace_shader = create_shader(
    vert,
    `#version 300 es
precision highp float;
precision highp usampler2D;
precision highp int;
uniform usampler2D old_tex;
uniform vec3 distortion_dot_dir_2;
uniform vec3 distortion_push_dir_1;
uniform float distortion_power_1;
uniform float time;
uniform float distortion_power_2;
uniform vec3 distortion_push_dir_2;
uniform vec2 resolution;
uniform usampler2D hash_tex;
uniform vec3 distortion_dot_dir_1;
out uvec4 frag_color;
struct Ray {
 vec3 pos;
 vec3 dir;
};
struct BoxIntersection {
 bool hit;
 float front_dist;
 float back_dist;
 vec3 front_norm;
};
float sympow(float x, float power)
{
  return (sign(x) * pow(abs(x), power));
}
Ray progress_ray(Ray ray, float t)
{
  return Ray((ray.pos + (ray.dir * t)), ray.dir);
}
uint pcg(uint x)
{
  uint state = ((x * 747796405u) + 2891336453u);
  uint word = (((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u);
  return ((word >> 22u) ^ word);
}
uvec3 pcg(uvec3 x)
{
  x = ((x * 1664525u) + 1013904223u);
  x.x += (x.y * x.z);
  x.y += (x.z * x.x);
  x.z += (x.x * x.y);
  x ^= (x >> 16u);
  x.x += (x.y * x.z);
  x.y += (x.z * x.x);
  x.z += (x.x * x.y);
  return x;
}
float rand_pcg(float p)
{
  return (float(pcg(floatBitsToUint(p))) / float(0xffffffffu));
}
float rand_pcg(vec2 p)
{
  return (float(pcg((pcg(floatBitsToUint(p.x)) + floatBitsToUint(p.y)))) / float(0xffffffffu));
}
vec3 rand_pcg(vec3 p)
{
  return (vec3(pcg(uvec3(floatBitsToUint(p.x), floatBitsToUint(p.y), floatBitsToUint(p.z)))) / float(0xffffffffu));
}
float rand(vec2 s)
{
  return rand_pcg((gl_FragCoord.xy + (s * 100.) + (time * vec2(-5.79152364633046090603, 9.7885538067203015089))));
}
float smoothstair(float x, float steps, float steepness)
{
  x *= steps;
  float c = ((2. / (1. - steepness)) - 1.);
  float p = mod(x, 1.);
  return ((floor(x) + ((p < 0.5) ? (pow(p, c) / pow(0.5, (c - 1.))) : (1. - (pow((1. - p), c) / pow(0.5, (c - 1.)))))) / steps);
}
BoxIntersection find_box_intersection(Ray ray, vec3 pos, vec3 size)
{
  vec3 m = (1. / ray.dir);
  vec3 n = (m * (ray.pos - pos));
  vec3 k = (abs(m) * size);
  vec3 t1 = (0. - (n + k));
  vec3 t2 = (k - n);
  float tN = max(max(t1.x, t1.y), t1.z);
  float tF = min(min(t2.x, t2.y), t2.z);
  if (((tN > tF) || (tF < 0.))) {
    return(BoxIntersection(false, 0., 0., vec3(0.)));
  }
  return BoxIntersection(true, tN, tF, (0. - (sign(ray.dir) * step(t1.yzx, t1.xyz) * step(t1.zxy, t1.xyz))));
}
vec2 cis(float angle)
{
  return vec2(cos(angle), sin(angle));
}
vec2 field(vec3 pos)
{
  ivec2 hash_pos = ivec2(((0.5 * (1. + pos.xy)) * 512.));
  uvec4 hash_data = texelFetch(hash_tex, hash_pos, 0);
  vec3 circle = vec3(((2. * (vec2(hash_data.xy) * 0.00000000023283064371)) - 1.), (float(hash_data.z) * 0.00000000023283064371));
  float circle_phase = (float((hash_data.w % 65535u)) * 0.00001525902189669642);
  float steepness = (pow(4., (float((hash_data.w / 65535u)) * 0.00001525902189669642)) * 0.2000000000000000111);
  {
    vec3 local_pos = ((pos - vec3((circle.xy + (0.02999999999999999889 * cis((6.283185307179586232 * smoothstair((circle_phase + (time * 0.2000000000000000111)), 4., steepness))))), 0.)) / circle.z);
    if (((hash_data.w % 2u) == 0u)) {
      local_pos = local_pos.yzx;
    }
    if ((((hash_data.w / 64u) % 2u) == 0u)) {
      local_pos = local_pos.zxy;
    }
    local_pos += (distortion_push_dir_1 * sympow(sin((6.283185307179586232 * ((0.66000000000000003109 * dot(local_pos, distortion_dot_dir_1) * pow(1.25, sin((time * 2.81700000000000017053)))) + (0.33000000000000001554 * time) + circle_phase))), distortion_power_1) * 0.125);
    local_pos += (distortion_push_dir_2 * sympow(sin(((6. * dot(local_pos, distortion_dot_dir_2) * pow(1.60000000000000008882, sin((time * 0.5)))) + (2.5 * time) + (6.283185307179586232 * 1.69999999999999995559 * circle_phase))), distortion_power_2) * 0.25);
    if ((length(local_pos) < 1.)) {
      return(vec2(1., 0.5999999999999999778));
    }
  }
  return vec2(0.);
}
void main()
{
  float resolution_max = max(resolution.x, resolution.y);
  vec2 pixel_pos = ((((gl_FragCoord.xy / resolution_max) - (0.5 * ((resolution - resolution_max) / resolution_max))) * 2.) - 1.);
  float accumulated_light = 0.;
  Ray base_ray = Ray(vec3(0., 0., -1.25), normalize(vec3((0.75 * pixel_pos), 1.)));
  BoxIntersection bound_intersection = find_box_intersection(base_ray, vec3(0.), vec3(1., 1., 0.1749999999999999889));
  if (bound_intersection.hit) {
    base_ray = progress_ray(base_ray, bound_intersection.front_dist);
    for (int i = 0; i < 1; i++) {
      vec3 pos = base_ray.pos;
      vec3 dir = base_ray.dir;
      float t = 1.;
      bool has_been_insideQUESTION_MARK = false;
      for (int j = 0; j < 22; j++) {
        pos += (-log(rand(vec2(i, j))) * 0.01750000000000000167 * dir);
        if (((abs(pos.x) <= 1.) && (abs(pos.y) <= 1.) && (abs(pos.z) <= 0.1749999999999999889))) {
          has_been_insideQUESTION_MARK = true;
          vec2 field_sample = field(pos);
          if ((field_sample.x > rand((vec2(i, j) + vec2(-0.77000000000000001776, 1.30000000000000004441))))) {
            t *= field_sample.y;
            dir = normalize(((2. * vec3(rand((vec2(i, j) + vec2(-0.16000000000000000333, 0.93000000000000004885))), rand((vec2(i, j) + vec2(0.2000000000000000111, 3.37000000000000010658))), rand((vec2(i, j) + vec2(-0.51200000000000001066, 2.31000000000000005329))))) - 1.));
          }
        }
  else {
          if (has_been_insideQUESTION_MARK) {
            accumulated_light += (t * smoothstep(0.5, 1., dot(dir, vec3(0., 0.2425356250363329691, -0.97014250014533187638))));
            break;
          }
        }
      }
    }
  }
  frag_color = uvec4(mix((accumulated_light * 34359738360.), float(texelFetch(old_tex, ivec2(gl_FragCoord.xy), 0).x), 0.96999999999999997335), 0u, 0u, 0u);
}
`,
    [
      'resolution',
      'old_tex',
      'hash_tex',
      'distortion_dot_dir_1',
      'distortion_push_dir_1',
      'distortion_dot_dir_2',
      'distortion_push_dir_2',
      'distortion_power_1',
      'distortion_power_2',
      'time',
    ],
  );
  const hash_shader = create_shader(
    vert,
    `#version 300 es
precision highp float;
precision highp usampler2D;
precision highp int;
uniform vec3[${circles.length}] circles;
out uvec4 frag_color;
uint pcg(uint x)
{
  uint state = ((x * 747796405u) + 2891336453u);
  uint word = (((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u);
  return ((word >> 22u) ^ word);
}
uvec3 pcg(uvec3 x)
{
  x = ((x * 1664525u) + 1013904223u);
  x.x += (x.y * x.z);
  x.y += (x.z * x.x);
  x.z += (x.x * x.y);
  x ^= (x >> 16u);
  x.x += (x.y * x.z);
  x.y += (x.z * x.x);
  x.z += (x.x * x.y);
  return x;
}
float rand_pcg(float p)
{
  return (float(pcg(floatBitsToUint(p))) / float(0xffffffffu));
}
float rand_pcg(vec2 p)
{
  return (float(pcg((pcg(floatBitsToUint(p.x)) + floatBitsToUint(p.y)))) / float(0xffffffffu));
}
vec3 rand_pcg(vec3 p)
{
  return (vec3(pcg(uvec3(floatBitsToUint(p.x), floatBitsToUint(p.y), floatBitsToUint(p.z)))) / float(0xffffffffu));
}
void main()
{
  vec3 closest_circle;
  float closest_dist = 10.;
  int closest_index;
  vec2 world_pos = ((2. * (gl_FragCoord.xy * 0.001953125)) - 1.);
  for (int i = 0; i < ${circles.length}; i++) {
    vec3 circle = circles[i];
    float d = (distance(world_pos, circle.xy) - circle.z);
    if ((d < closest_dist)) {
      closest_index = i;
      closest_dist = d;
      closest_circle = circle;
    }
  }
  frag_color = uvec4(((0.5 * (1. + closest_circle.xy)) * 4294967295.), (closest_circle.z * 4294967295.), (uint((rand_pcg(vec2(closest_index, 0.)) * 65535.)) + (65535u * uint((rand_pcg(vec2(closest_index, 21.71000000000000085265)) * 65535.)))));
}
`,
    ['circles'],
  );
  framebuffer = gl.createFramebuffer();
  hash_tex = create_tex(512, 512);
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, hash_tex, 0);
  gl.useProgram(hash_shader);
  gl.uniform3fv(hash_shader.circles, circles.flat());
  gl.viewport(0, 0, 512, 512);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  if (!webGLRenderer) {
    webGLRenderer = new WebGLRenderer(renderTask);
    webGLRenderer.start()
  }
  return null;
};
const kill = () => {
  if (webGLRenderer) {
    webGLRenderer.stop()
    webGLRenderer = null
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.clear(gl.COLOR_BUFFER_BIT);
  canvas = null;
  gl = null;
  texs = null;
  hash_tex = null;
  framebuffer = null;
  render_shader = null;
  trace_shader = null;
  return null;
};
const renderTask = () => {
  if (canvas) {
    const width = canvas.width;
    const height = canvas.height;
    gl.viewport(0, 0, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    if (width !== last_resolution[0] || height !== last_resolution[1]) {
      last_resolution = [width, height];
      const old_texs = texs;
      texs = [create_tex(width, height), create_tex(width, height)];
      if (old_texs) {
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texs[0], 0);
        gl.useProgram(rescale_shader);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, old_texs[0]);
        gl.uniform1i(rescale_shader.tex, 0);
        gl.uniform2fv(rescale_shader.resolution, [width, height]);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.deleteTexture(old_texs[0]);
        gl.deleteTexture(old_texs[1]);
      }
    }
    if (!texs) texs = [create_tex(width, height), create_tex(width, height)];

    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texs[1], 0);
    gl.useProgram(trace_shader);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texs[0]);
    gl.activeTexture(gl.TEXTURE0 + 1);
    gl.bindTexture(gl.TEXTURE_2D, hash_tex);
    gl.uniform1i(trace_shader.old_tex, 0);
    gl.uniform1i(trace_shader.hash_tex, 1);
    gl.uniform2fv(trace_shader.resolution, [width, height]);
    gl.uniform1fv(trace_shader.time, [0.0006 * window.performance.now()]);
    gl.uniform3fv(trace_shader.distortion_dot_dir_1, distortion_dot_dir_1);
    gl.uniform3fv(trace_shader.distortion_push_dir_1, distortion_push_dir_1);
    gl.uniform3fv(trace_shader.distortion_dot_dir_2, distortion_dot_dir_2);
    gl.uniform3fv(trace_shader.distortion_push_dir_2, distortion_push_dir_2);
    gl.uniform1fv(trace_shader.distortion_power_1, [distortion_power_1]);
    gl.uniform1fv(trace_shader.distortion_power_2, [distortion_power_2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    texs.reverse();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(render_shader);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texs[0]);
    gl.uniform1i(render_shader.tex, 0);
    gl.uniform2fv(render_shader.resolution, [width, height]);
    gl.uniform3fv(render_shader.color, cell_color);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  return null;
};

const set_color = (new_color) => {
  cell_color = new_color;
};

export const start_cells = init;
export const stop_cells = kill;
export const set_cell_color = set_color;
