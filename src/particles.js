import { AdditiveBlending, BufferGeometry, CanvasTexture, Color, Float32BufferAttribute, Points, ShaderMaterial, SRGBColorSpace } from 'three'
import { mulberry32, paintSoftDot, paintSparkle } from './textures.js'

// GPU particles. Each emitter is one Points object whose particles loop
// forever: a particle's position is a closed-form function of time (spawn
// point + velocity * age + gravity), computed in the vertex shader, so the
// CPU only advances one shared time uniform per frame (no per-frame
// allocation, cheap on phones). Every particle has a random spawn point in
// one of the emitter's boxes, a random phase so they never pulse in sync, and
// a random velocity jitter. Additive and HDR-bright, so bloom makes them glow.
// The graphics preset's `particles` density trims each emitter's draw range.
const shared = {
  uTime: { value: 0 },
  uViewport: { value: 800 }, // drawing-buffer height in px (point sizes are in metres)
}
const emitters = []
let density = 1
let sprites = null

function spriteTextures() {
  if (sprites) return sprites
  const make = (c) => {
    const t = new CanvasTexture(c)
    t.colorSpace = SRGBColorSpace
    return t
  }
  sprites = { dot: make(paintSoftDot()), sparkle: make(paintSparkle()) }
  return sprites
}

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uViewport;
  uniform float uLife;
  uniform float uSize;
  uniform float uGrow;
  uniform float uGravity;
  uniform float uTwinkle;
  uniform vec3 uVelocity;
  uniform vec3 uSpread;
  attribute vec4 rnd; // x: phase 0..1, yzw: velocity jitter -1..1
  attribute vec3 tint;
  varying float vAlpha;
  varying vec3 vTint;
  void main() {
    float age = mod(uTime + rnd.x * uLife, uLife);
    float k = age / uLife;
    vec3 v = uVelocity + uSpread * rnd.yzw;
    vec3 p = position + v * age;
    p.y -= 0.5 * uGravity * age * age;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float fade = smoothstep(0.0, 0.12, k) * (1.0 - smoothstep(0.55, 1.0, k));
    float tw = uTwinkle > 0.0 ? 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * uTwinkle + rnd.x * 61.0), 3.0) : 1.0;
    vAlpha = fade * tw;
    vTint = tint;
    float size = uSize * (0.65 + 0.35 * abs(rnd.y)) * mix(1.0, uGrow, k);
    gl_PointSize = size * projectionMatrix[1][1] * 0.5 * uViewport / max(-mv.z, 0.1);
  }`

const fragmentShader = /* glsl */ `
  uniform sampler2D map;
  uniform float uIntensity;
  uniform float uOpacity;
  varying float vAlpha;
  varying vec3 vTint;
  void main() {
    vec4 t = texture2D(map, gl_PointCoord);
    gl_FragColor = vec4(vTint * t.rgb * uIntensity, t.a * vAlpha * uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`

// opts: {
//   boxes: [{ x, y, z, sx, sy, sz, color? }]  spawn boxes (half extents), world space
//   count, life (s), velocity [x,y,z], spread [x,y,z] (velocity jitter),
//   gravity (m/s^2, down), size (m), grow (size multiplier at end of life),
//   color, intensity (HDR multiplier), opacity, twinkle (rad/s, 0 = steady),
//   sprite: 'dot' | 'sparkle', seed, parent (Object3D the points join; default the scene)
// }
export function createEmitter(scene, opts) {
  const rand = mulberry32(opts.seed ?? 1)
  const n = opts.count
  const pos = new Float32Array(n * 3)
  const rnd = new Float32Array(n * 4)
  const tint = new Float32Array(n * 3)
  const c = new Color()
  for (let i = 0; i < n; i++) {
    const b = opts.boxes[Math.floor(rand() * opts.boxes.length)]
    pos[i * 3] = b.x + (rand() * 2 - 1) * (b.sx ?? 0)
    pos[i * 3 + 1] = b.y + (rand() * 2 - 1) * (b.sy ?? 0)
    pos[i * 3 + 2] = b.z + (rand() * 2 - 1) * (b.sz ?? 0)
    rnd.set([rand(), rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1], i * 4)
    c.set(b.color ?? opts.color ?? '#ffffff')
    tint.set([c.r, c.g, c.b], i * 3)
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3))
  geo.setAttribute('rnd', new Float32BufferAttribute(rnd, 4))
  geo.setAttribute('tint', new Float32BufferAttribute(tint, 3))
  const mat = new ShaderMaterial({
    uniforms: {
      ...shared,
      map: { value: spriteTextures()[opts.sprite ?? 'dot'] },
      uLife: { value: opts.life },
      uSize: { value: opts.size },
      uGrow: { value: opts.grow ?? 1 },
      uGravity: { value: opts.gravity ?? 0 },
      uTwinkle: { value: opts.twinkle ?? 0 },
      uVelocity: { value: opts.velocity ?? [0, 0, 0] },
      uSpread: { value: opts.spread ?? [0, 0, 0] },
      uIntensity: { value: opts.intensity ?? 1 },
      uOpacity: { value: opts.opacity ?? 1 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })
  const points = new Points(geo, mat)
  points.frustumCulled = false // positions move in the shader; the bounds would be wrong
  points.renderOrder = 2
  ;(opts.parent ?? scene).add(points) // a parent makes the boxes local to it (smoke riding a train)
  emitters.push({ points, count: n })
  geo.setDrawRange(0, Math.round(n * density))
  return points
}

// Takes an emitter out of the scene and frees it (a remote player's boat leaving).
export function removeEmitter(points) {
  const i = emitters.findIndex((e) => e.points === points)
  if (i >= 0) emitters.splice(i, 1)
  points.removeFromParent()
  points.geometry.dispose()
  points.material.dispose()
}

// 0..1 share of every emitter's particles that are drawn (graphics preset).
export function setParticleDensity(d) {
  density = d
  for (const e of emitters) e.points.geometry.setDrawRange(0, Math.round(e.count * density))
}

export function updateParticles(elapsed, viewportHeight) {
  shared.uTime.value = elapsed
  shared.uViewport.value = viewportHeight
}
