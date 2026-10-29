/** Fullscreen triangle from gl_VertexID; no attributes or buffers needed. */
export const vertexSource = `#version 300 es
void main(){
  vec2 v = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(v * 2.0 - 1.0, 0.0, 1.0);
}`;

/** Soft-edge "liquid pixel" renderer over the blended shape field; design notes in README.md. */
export const fragmentSource = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uWarp;       /* base domain warp */
uniform float uMelt;       /* extra warp while shape scores cross over */
uniform float uDark;       /* 1 in dark mode */
uniform vec4 uPosA;        /* cells A and B */
uniform vec4 uPosB;        /* cells C and D */
uniform vec2 uPosE;        /* cell E */
uniform vec4 uTOffs;       /* time offsets A-D, scale with separation */
uniform float uTOffE;
uniform vec4 uG;           /* progress of the four splits, 0..1 each */
uniform float uCellScale;
uniform float uWidth;      /* band half-width */
uniform float uZoom;       /* view eases back as the colony divides */
uniform float uGrid;       /* pixel-grid cells across: lower is chunkier */
uniform int uStamp;        /* grain stamp: 0 square, 1 plus */
uniform int uShape;        /* 0 the morphing mark, 1 the database icon */
uniform float uEnter;      /* entrance progress 0..1; at 1 the piece is at rest */
uniform float uFizz;       /* fizz clock in seconds, separate from the frozen shape clock of a still */
uniform float uFizzAmount; /* fizz strength 0..1; 0 leaves every grain as uTime draws it */
out vec4 outColor;

/* marketing gradient hues (styling/gradients.css) */
const vec3 PEACH = vec3(1.000, 0.780, 0.576);
const vec3 BLUE = vec3(0.224, 0.627, 0.984);
const vec3 PURPLE = vec3(0.765, 0.470, 0.945);
const vec3 TEAL = vec3(0.008, 0.608, 0.506);
const float PI = 3.14159265;

float rSuper(float th, float n){
  float c = pow(abs(cos(th)), n) + pow(abs(sin(th)), n);
  return pow(c, -1.0 / n);
}
float rTri(float th){
  float t = mod(th + PI * 0.5, 2.0 * PI / 3.0) - PI / 3.0;
  return mix(1.0 / cos(t), 1.0, 0.42) / 1.22;
}

/* per-shape drift scores: layered incommensurate sines, so the blend never repeats */
vec4 shapeScores(float t){
  return vec4(
    sin(t * 0.131 + 1.7) + sin(t * 0.077 + 0.3),   /* circle */
    sin(t * 0.097 + 4.1) + sin(t * 0.059 + 2.2),   /* triangle */
    sin(t * 0.113 + 2.9) + sin(t * 0.071 + 5.0),   /* blob */
    sin(t * 0.089 + 0.9) + sin(t * 0.053 + 3.6));  /* diamond */
}
float logoScore(float t){
  return 1.15 + 0.35 * sin(t * 0.043 + 0.6);
}

float rMix(float th, float t){
  vec4 e = exp(2.2 * shapeScores(t));
  float el = exp(2.2 * logoScore(t));
  float r = el * rSuper(th, 3.54)
          + e.x * 1.0
          + e.y * rTri(th + 0.25 * sin(t * 0.4))
          + e.z * (1.0 + 0.14 * sin(3.0 * th + t * 0.9) + 0.08 * sin(5.0 * th - t * 1.3))
          + e.w * rSuper(th + 0.785 + 0.25 * sin(t * 0.35), 1.3) * 1.02;
  return r / (el + e.x + e.y + e.z + e.w);
}

/* 0 when one shape clearly dominates (calm), 1 during a crossover (molten) */
float activity(float t){
  vec4 e = exp(2.2 * shapeScores(t));
  float el = exp(2.2 * logoScore(t));
  float sum = el + e.x + e.y + e.z + e.w;
  float mx = max(el, max(max(e.x, e.y), max(e.z, e.w))) / sum;
  return clamp((1.0 - mx) * 2.2, 0.0, 1.0);
}

float smin(float a, float b, float k){
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

/* One cell's filled body: the band centerline as a disk, per-cell time so each
   daughter sits at its own morph stadium. The blend is sampled at an angularly
   lagged time (a crossover travels around the ring), and the boundary always
   breathes a little, even at rest on the logo. */
float cellFill(vec2 p, vec2 pos, float t, float R){
  vec2 pp = p - pos;
  float th = atan(pp.y, pp.x);
  float ad = abs(mod(th - t * 0.11 + PI, 2.0 * PI) - PI) / PI;
  float tl = t - 2.3 * ad;
  float amb = 1.0 + 0.012 * sin(3.0 * th + t * 0.7) + 0.007 * sin(5.0 * th - t * 1.1);
  return length(pp) - R * uCellScale * rMix(th, tl) * amb;
}

/* Mitosis: cell bodies join through a smooth minimum, so a split pinches a
   shared membrane apart; the shapes never swap. Each cell only enters the
   field once its split starts (k ramps from 0, so there is no pop). */
float bandField(vec2 p, float t, float R){
  float f = cellFill(p, uPosA.xy, t + uTOffs.x, R);
  if (uG.x > 0.0) f = smin(f, cellFill(p, uPosA.zw, t + uTOffs.y, R), 0.06 * min(1.0, uG.x * 6.0));
  if (uG.y > 0.0) f = smin(f, cellFill(p, uPosB.xy, t + uTOffs.z, R), 0.06 * min(1.0, uG.y * 6.0));
  if (uG.z > 0.0) f = smin(f, cellFill(p, uPosB.zw, t + uTOffs.w, R), 0.06 * min(1.0, uG.z * 6.0));
  if (uG.w > 0.0) f = smin(f, cellFill(p, uPosE, t + uTOffE, R), 0.06 * min(1.0, uG.w * 6.0));
  return f;
}

/* Real mark proportions: outer band centerline 0.4628, inner 0.25, half-width
   0.0372, all in units where the full logo spans [-0.5, 0.5]. The inner band
   trails the outer one by 0.8s. */
/* Lucide's database icon as stroke distance, its 24-unit box scaled so the strokes span the mark's width: a top
   ellipse, the front arcs of the middle and bottom discs, and the two sides. The ellipse distance is an
   approximation that holds near the curve, which is all a stroke needs. */
float ellipseDist(vec2 p, vec2 ab){
  float k0 = length(p / ab);
  float k1 = max(length(p / (ab * ab)), 1e-4);
  return abs(k0 * (k0 - 1.0) / k1);
}
float frontArcDist(vec2 p, vec2 ab){
  return p.y <= 0.0 ? ellipseDist(p, ab) : length(vec2(abs(p.x) - ab.x, p.y));
}
float databaseField(vec2 p){
  vec2 ab = vec2(9.0, 3.0) / 22.0;
  float h = 7.0 / 22.0;
  /* smooth unions round the joins, so the strokes flow into each other like the mark's bands */
  float d = ellipseDist(p - vec2(0.0, h), ab);
  d = smin(d, frontArcDist(p, ab), 0.12);
  d = smin(d, frontArcDist(p + vec2(0.0, h), ab), 0.12);
  return smin(d, length(vec2(abs(p.x) - ab.x, max(abs(p.y) - h, 0.0))), 0.12);
}

float scene(vec2 p, float time){
  p *= uZoom;
  float act = activity(time);
  /* the icon takes more warp than the mark and thicker strokes, so it reads as a blob first and the icon second */
  float warp = (uWarp + uMelt * act) * (uShape == 1 ? 1.35 : 1.0);
  vec2 w = vec2(
    sin(p.y * 3.3 + time * 0.6) + 0.5 * sin(p.y * 6.7 - time * 0.9),
    sin(p.x * 3.1 - time * 0.7) + 0.5 * sin(p.x * 5.9 + time * 0.8));
  p += warp * 0.06 * w;
  float s = 1.0 + 0.02 * sin(time * 0.8);
  p /= s;
  if (uShape == 1) return (databaseField(p) - uWidth * 1.2) * s;
  float dOut = abs(bandField(p, time, 0.4628)) - uWidth;
  float dIn = abs(bandField(p, time - 0.8, 0.25)) - uWidth;
  return min(dOut, dIn) * s;
}

/* Rotating palette: each hue carries a slow off-beat score and a sharpened
   blend keeps one or two dominant at a time, so every frame has a specific
   duo-tone palette (current, plus the one ~9s behind it), never all four. */
vec3 paletteAt(float t){
  vec4 w = exp(2.5 * vec4(
    sin(t * 0.051 + 0.0),
    sin(t * 0.047 + 1.9),
    sin(t * 0.059 + 3.9),
    sin(t * 0.043 + 5.1)));
  return (w.x * PEACH + w.y * BLUE + w.z * PURPLE + w.w * TEAL) / (w.x + w.y + w.z + w.w);
}
vec3 brandFlow(vec2 p, float time){
  vec3 cA = paletteAt(time);
  vec3 cB = paletteAt(time - 9.0);
  float n1 = 0.5 + 0.5 * sin(p.x * 2.0 + p.y * 1.3 + time * 0.45);
  float n2 = 0.5 + 0.5 * sin((p.x - p.y) * 1.9 - time * 0.35 + 2.1);
  vec3 c = mix(cA, cB, n1);
  c *= 0.92 + 0.16 * n2;
  return c;
}

/* Soft-edge pixel renderer: the field quantized to a fine grid. Outside the
   boundary each cell survives with a probability that decays with distance,
   surviving grains shrink, fade individually and lose their hard corners, so
   the edge dissolves granularly, with no pixel cliff.
   Entrance (condense): the survival falloff K starts wide open, so sparse grains dust
   the whole frame; as it tightens they wink out from the outside in and the mark
   precipitates. No grain travels, and at uEnter = 1 every factor is the identity.
   Fizz keeps the grains of a still alive on their own clock while the shape and palette hold: the grid slowly wavers
   by up to half a cell, and edge grains flicker harder and re-roll their survival on staggered beats, fading into the
   new roll. Grains inside the boundary always survive, so the outline stays put. It fades in with the entrance and is
   the identity at 0. */
vec4 pixelLiquid(vec2 q, float time, float N, float K, float shrink, float alphaMul, float flick, float soft){
  float ez = uEnter * uEnter * (3.0 - 2.0 * uEnter);
  float fz = uFizzAmount * ez;
  float ft = time + uFizz;
  q += fz * 0.5 / N * vec2(sin(q.y * N * 0.37 + ft * 0.9), sin(q.x * N * 0.41 - ft * 0.8));
  vec2 cell = floor(q * N);
  vec2 qq = (cell + 0.5) / N;
  float d = scene(qq, time);
  float h = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
  float h2 = fract(h * 7.13);
  K = mix(0.75, K, ez * ez);
  float p = clamp(exp(-(d + 0.01) * K), 0.0, 1.0);
  p *= mix(1.0, 0.6 + 0.4 * sin(ft * 1.4 + h * 6.2831), mix(flick, 0.5, fz) * clamp(d * K, 0.0, 1.0));
  p *= mix(0.10, 1.0, ez);
  float on = step(h, p);
  if (h2 < fz) {
    /* beats wrap, so the hash input stays small enough for float precision */
    float beatAt = uFizz * 0.7 + h * 7.0;
    float beat = mod(floor(beatAt), 61.0);
    float rollA = fract(sin(dot(cell + beat * vec2(13.7, 7.1), vec2(127.1, 311.7))) * 43758.5453);
    float rollB = fract(sin(dot(cell + mod(beat + 1.0, 61.0) * vec2(13.7, 7.1), vec2(127.1, 311.7))) * 43758.5453);
    on = mix(step(rollA, p), step(rollB, p), smoothstep(0.5, 1.0, fract(beatAt)));
  }
  float grainA = on * mix(1.0, p, soft);
  vec2 f = fract(q * N) - 0.5;
  vec2 a = abs(f);
  float rad = mix(0.5, 0.16, shrink * (1.0 - p));
  /* plus grains cover less area than squares, so their arms get a length boost */
  if (uStamp == 1) rad = min(rad * 1.3, 0.5);
  /* grain stamp: a square, or a plus (two crossed bars, arm half-thickness 0.36 * rad) */
  float m = uStamp == 0 ? max(a.x, a.y) : min(max(a.x, a.y * 2.78), max(a.y, a.x * 2.78));
  float dotM = 1.0 - smoothstep(rad - 0.04, rad + mix(0.02, 0.25, soft), m);
  vec3 g = brandFlow(qq * 1.8, time);
  /* light mode saturates the hue hard, so color survives the low-opacity multiply blend */
  float luma = dot(g, vec3(0.299, 0.587, 0.114));
  g = mix(g, clamp(mix(vec3(luma), g, 2.4), 0.0, 1.0), 1.0 - uDark);
  float depth = smoothstep(0.0, -0.10, d);
  /* light mode inverts the band shading: light core, dark edge (dark mode glows white at the edge) */
  g = mix(g * mix(0.92, 0.82, uDark), g * mix(1.45, 1.12, uDark), depth);
  /* light mode: the band body itself goes whiteish (the mask saturates well before the centerline) */
  float core = smoothstep(0.0, -0.025, d);
  g = mix(g, vec3(1.0), (1.0 - uDark) * core * 0.7);
  g *= 0.94 + 0.12 * h2;
  float rim = exp(-abs(d) * 55.0);
  g += vec3(1.0) * rim * 0.40 * uDark;
  /* light mode rim: push toward the pure saturated hue - under a multiply blend, color
     shows where channels differ, so a vivid rim beats a darkened one */
  float rimL = exp(-abs(d) * 90.0);
  float mx = max(g.r, max(g.g, g.b));
  vec3 vivid = pow(g / max(mx, 1e-3), vec3(3.0)) * 0.85;
  g = mix(g, vivid, rimL * (1.0 - uDark));
  return vec4(g, grainA * dotM * alphaMul * mix(0.45, 1.0, ez));
}

void main(){
  float minRes = min(uRes.x, uRes.y);
  vec2 p = (2.0 * gl_FragCoord.xy - uRes) / minRes;
  vec2 q = p * 0.625;
  outColor = pixelLiquid(q, uTime, uGrid, 11.0, 0.7, 0.97, 0.25, 1.0);
}`;
