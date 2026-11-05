import { DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Vector2 } from 'three'
import { COLORS, HUB } from './config.js'
import { bake } from './bake.js'
import { RAPIER, addFixed } from './physics.js'
import { blk, lego, octagon, slabGeo } from './lego.js'
import { neon, solidBox } from './propkit.js'
import { createEmitter } from './particles.js'
import { mulberry32, paintLaneWater, paintWaterfall, toTexture } from './textures.js'

// The hub's ground and shell: grass, gray paths, the octagonal sand plaza with
// its yellow rim and the white spawn pad, the brown lego cliffs all round
// (orange-tan bricks near the top, a grass cap with dripping vines, two
// tiers with trees on the plateaus), the yellow gate north into the train
// lane (lane.js), waterfalls into a pool along the west cliff, fences and lamp posts.
// Everything static is built into groups and baked to a few meshes.

const { west: W, east: E, north: N, south: S } = HUB.bounds
const H = HUB.wallHeight
const T = HUB.wallThick

function bakeInto(scene, group, cast = true) {
  const out = bake(group, cast)
  out.traverse((o) => {
    if (o.isMesh) o.receiveShadow = true
  })
  scene.add(out)
  return out
}

const rect = (x0, z0, x1, z1) => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
]

// A flat ground piece whose top is at `top` (UVs are world metres, so overlapping pieces line up).
function flat(group, points, mat, top, thick = 0.06, holes) {
  const m = new Mesh(slabGeo(points, thick, holes), mat)
  m.position.y = top - thick
  m.receiveShadow = true
  group.add(m)
  return m
}

// --- Cliffs ------------------------------------------------------------------------
// An axis-aligned cliff block [x0, x1] x [z0, z1], `h` tall, detailed on the faces listed
// ('n', 's', 'e', 'w' = the face looking toward -Z, +Z, +X, -X).
function cliff(group, rand, x0, x1, z0, z1, h, base, faces) {
  const dirt = lego(COLORS.dirt)
  const tan = lego(COLORS.dirtTan)
  const dark = lego(COLORS.dirtDark)
  const grass = lego(COLORS.grass)
  const leaf = lego(COLORS.leafDark)
  const w = x1 - x0
  const d = z1 - z0
  blk(group, dirt, w, h, d, (x0 + x1) / 2, base, (z0 + z1) / 2)
  blk(group, grass, w + 0.2, 0.7, d + 0.2, (x0 + x1) / 2, base + h - 0.35, (z0 + z1) / 2) // grass cap
  for (const f of faces) {
    const alongX = f === 'n' || f === 's'
    const len = alongX ? w : d
    const start = alongX ? x0 : z0
    const out = f === 'n' ? -1 : f === 's' ? 1 : f === 'w' ? -1 : 1
    const faceAt = f === 'n' ? z0 : f === 's' ? z1 : f === 'w' ? x0 : x1
    // Places a block on this face: `a` along it, `p` = protrusion out of the face.
    const onFace = (mat, a, y, along, tall, p) => {
      const c = faceAt + (out * p) / 2
      if (alongX) blk(group, mat, along, tall, p, a, y, c)
      else blk(group, mat, p, tall, along, c, y, a)
    }
    // Orange-tan bricks crowding the upper half, a few dark ones low down.
    for (let i = 0; i < len / 2.2; i++) {
      const along = 1.6 + rand() * 4
      const tall = 0.8 * (1 + Math.floor(rand() * 3))
      const y = base + h * (0.42 + rand() * 0.5) - tall
      onFace(tan, start + rand() * len, Math.min(y, base + h - tall - 0.3), along, tall, 0.28 + rand() * 0.2)
    }
    for (let i = 0; i < len / 7; i++) onFace(dark, start + rand() * len, base + rand() * h * 0.35, 1.6 + rand() * 3, 0.8 * (1 + Math.floor(rand() * 2)), 0.22)
    // Grass lip hanging over the face, then vines dripping down from it.
    onFace(grass, start + len / 2, base + h - 0.9, len, 0.9, 0.55)
    for (let i = 0; i < len / 1.5; i++) {
      const long = rand() < 0.25 ? 2.5 + rand() * 4.5 : 0.5 + rand() * 1.6
      onFace(rand() < 0.5 ? grass : leaf, start + rand() * len, base + h - 0.6 - long, 0.4 + rand() * 0.8, long, 0.62)
    }
  }
}

// --- Trees ------------------------------------------------------------------------------
// Lego acacia: a studded trunk forking into two branches under flat, stepped canopies with drips.
function tree(group, rand, x, y, z, scale = 1) {
  const trunk = lego(COLORS.trunk)
  const leaf = lego(COLORS.leaf)
  const leafDark = lego(COLORS.leafDark)
  const s = scale
  const th = (6 + rand() * 3) * s
  blk(group, trunk, 1.3 * s, th, 1.3 * s, x, y, z)
  const branches = []
  for (const side of [-1, 1]) {
    const yaw = rand() * Math.PI
    const len = (3 + rand() * 2) * s
    const b = blk(group, trunk, 0.8 * s, len, 0.8 * s, 0, 0, 0)
    const lean = side * (0.55 + rand() * 0.25)
    b.position.set(x + Math.cos(yaw) * Math.sin(lean) * len * 0.5, y + th * 0.72 + Math.cos(lean) * len * 0.5, z + Math.sin(yaw) * Math.sin(lean) * len * 0.5)
    b.rotation.set(0, -yaw, -lean, 'YXZ')
    branches.push([x + Math.cos(yaw) * Math.sin(lean) * len, y + th * 0.72 + Math.cos(lean) * len, z + Math.sin(yaw) * Math.sin(lean) * len])
  }
  const top = Math.max(y + th, ...branches.map((b) => b[1])) + 0.2
  const cw = (8 + rand() * 4) * s
  blk(group, leaf, cw, 1.2 * s, cw * (0.8 + rand() * 0.3), x, top, z)
  blk(group, leaf, cw * 0.62, 1 * s, cw * 0.6, x + (rand() - 0.5) * 2, top + 1.2 * s, z + (rand() - 0.5) * 2)
  blk(group, leafDark, cw * 0.36, 0.8 * s, cw * 0.36, x + (rand() - 0.5) * 2, top + 2.2 * s, z + (rand() - 0.5) * 2)
  for (const [bx, by, bz] of branches) blk(group, leafDark, cw * 0.55, 0.9 * s, cw * 0.5, bx, top - 0.6 * s, bz)
  for (let i = 0; i < 14; i++) {
    const a = rand() * Math.PI * 2
    const r = cw * 0.48
    const long = 0.6 + rand() * 2.2
    blk(group, rand() < 0.5 ? leaf : leafDark, 0.5, long, 0.5, x + Math.cos(a) * r, top - long + 0.2, z + Math.sin(a) * r * 0.9)
  }
}

// --- Fences + lamps ---------------------------------------------------------------------------
function fence(group, x0, z0, x1, z1) {
  const wood = lego(COLORS.woodLight)
  const dark = lego(COLORS.wood)
  const len = Math.hypot(x1 - x0, z1 - z0)
  const yaw = Math.atan2(-(z1 - z0), x1 - x0)
  const n = Math.max(1, Math.round(len / 2.6))
  for (let i = 0; i <= n; i++) {
    const t = i / n
    blk(group, dark, 0.36, 1.7, 0.36, x0 + (x1 - x0) * t, 0, z0 + (z1 - z0) * t, yaw)
  }
  for (const y of [0.55, 1.15]) blk(group, wood, len, 0.24, 0.16, (x0 + x1) / 2, y, (z0 + z1) / 2, yaw)
}

export function lampPost(group, x, z) {
  blk(group, lego(COLORS.white), 0.9, 0.4, 0.9, x, 0, z)
  blk(group, lego(COLORS.white), 0.42, 3.2, 0.42, x, 0.4, z)
  blk(group, lego('#3a3a40'), 0.9, 0.18, 0.9, x, 3.6, z)
  blk(group, lego('#3a3a40'), 0.9, 0.18, 0.9, x, 4.62, z)
  const bulb = blk(group, neon('#ffd84a', 2.6), 0.75, 0.85, 0.75, x, 3.78, z)
  bulb.castShadow = false
  return bulb
}

// --- Waterfalls ---------------------------------------------------------------------------------
function waterfall(scene, group, dynamic, face, at, width) {
  const tex = toTexture(paintWaterfall(256), { srgb: true })
  tex.repeat.set(width / 4, H / 6)
  const sheet = new MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.95, side: DoubleSide, depthWrite: false })
  const foamTex = tex.clone()
  foamTex.repeat.set(width / 2.5, H / 9)
  const foam = neon('#ffffff', 1.6, { map: foamTex, transparent: true, opacity: 0.35, side: DoubleSide, depthWrite: false })
  const glowSheet = neon('#8fd8ff', 1.25, { map: tex, transparent: true, opacity: 0.55, side: DoubleSide, depthWrite: false })
  const plane = new PlaneGeometry(width, H + 0.6)
  const place = (m, off) => {
    if (face === 'west') {
      m.position.set(W + off, H / 2 - 0.1, at)
      m.rotation.y = Math.PI / 2
    } else {
      m.position.set(at, H / 2 - 0.1, N + off)
    }
    m.renderOrder = 2
    dynamic.add(m)
  }
  place(new Mesh(plane, sheet), 0.75)
  place(new Mesh(plane, glowSheet), 0.8)
  place(new Mesh(plane, foam), 0.9)
  // Lip at the top and a carved channel in the grass cap.
  const lipMat = lego('#bfeaff')
  if (face === 'west') {
    blk(group, lego(COLORS.water), 2.6, 0.5, width + 0.4, W + 0.5, H - 0.4, at)
    blk(group, lipMat, 0.5, 0.4, width + 0.8, W + 0.9, H - 0.55, at)
  } else {
    blk(group, lego(COLORS.water), width + 0.4, 0.5, 2.6, at, H - 0.4, N - 0.5)
    blk(group, lipMat, width + 0.8, 0.4, 0.5, at, H - 0.55, N + 0.9)
  }
  // Splash: mist rising where it hits the water, sparkles drifting on the sheet.
  const bx = face === 'west' ? W + 1.6 : at
  const bz = face === 'west' ? at : N + 1.6
  createEmitter(scene, {
    boxes: [{ x: bx, y: 0.4, z: bz, sx: face === 'west' ? 0.8 : width / 2, sy: 0.1, sz: face === 'west' ? width / 2 : 0.8 }],
    count: 70,
    life: 1.6,
    velocity: [face === 'west' ? 1.0 : 0, 1.6, face === 'west' ? 0 : 1.0],
    spread: [0.8, 0.8, 0.8],
    gravity: 1.2,
    size: 0.9,
    grow: 2.2,
    color: '#e8f7ff',
    intensity: 1.1,
    opacity: 0.55,
    seed: Math.round(at * 13 + 7),
  })
  createEmitter(scene, {
    boxes: [{ x: face === 'west' ? W + 1 : at, y: H * 0.5, z: face === 'west' ? at : N + 1, sx: face === 'west' ? 0.2 : width / 2, sy: H * 0.45, sz: face === 'west' ? width / 2 : 0.2 }],
    count: 26,
    life: 1.4,
    velocity: [0, -3, 0],
    spread: [0.2, 1, 0.2],
    size: 0.35,
    color: '#ffffff',
    intensity: 2.4,
    twinkle: 7,
    sprite: 'sparkle',
    seed: Math.round(at * 7 + 3),
  })
  return [tex, foamTex]
}

// --- Gate ----------------------------------------------------------------------------------------
function gate(group) {
  const g = HUB.gate
  const y = lego(COLORS.yellow)
  const yd = lego(COLORS.yellowDark)
  const light = neon('#ffffff', 2.2)
  const p = g.pillar
  for (const s of [-1, 1]) {
    const x = s * (g.halfGap + p / 2 - 0.2)
    blk(group, y, p, g.height, p, x, 0, N - p / 2 + 0.6)
    blk(group, yd, p + 0.4, 0.8, p + 0.4, x, 0, N - p / 2 + 0.6) // plinth
    blk(group, yd, p + 0.3, 0.6, p + 0.3, x, g.height - 0.6, N - p / 2 + 0.6) // cap
    for (const ly of [g.height * 0.32, g.height * 0.68]) {
      // White light bars on the front and on the inner face.
      blk(group, light, p * 0.7, 0.45, 0.12, x, ly, N + 0.66).castShadow = false
      blk(group, light, 0.12, 0.45, p * 0.7, x - s * (p / 2 + 0.02), ly, N - p / 2 + 0.6).castShadow = false
    }
    blk(group, light, p * 0.7, 0.45, 0.12, x, g.height - 1.4, N + 0.66).castShadow = false
  }
  const span = 2 * (g.halfGap + p - 0.2)
  blk(group, y, span, g.beamTop - g.beamBottom, p * 0.9, 0, g.beamBottom, N - p / 2 + 0.6)
  blk(group, yd, span - 2 * p, 0.5, p, 0, g.beamBottom - 0.2, N - p / 2 + 0.6)
  // Stepped notches along the beam top.
  for (let i = -2; i <= 2; i++) blk(group, y, 1.6, 0.8, p * 0.9, i * 3.2, g.beamTop, N - p / 2 + 0.6)
  for (const s of [-1, 1]) blk(group, light, 2.2, 0.4, 0.12, s * 5.5, (g.beamBottom + g.beamTop) / 2 - 0.2, N + 0.66).castShadow = false
  solidBox(p / 2, g.height / 2, p / 2, g.halfGap + p / 2 - 0.2, g.height / 2, N - p / 2 + 0.6)
  solidBox(p / 2, g.height / 2, p / 2, -(g.halfGap + p / 2 - 0.2), g.height / 2, N - p / 2 + 0.6)
}

export function buildHub(scene) {
  const rand = mulberry32(HUB.treeSeed)
  const ground = new Group()
  const walls = new Group()
  const dynamic = new Group() // animated or transparent: never baked
  scene.add(dynamic)

  // --- Ground: grass everywhere, gray paths, the plaza ---------------------------------
  const grass = lego(COLORS.grass)
  const path = lego(COLORS.path, { checker: true })
  const sand = lego(COLORS.sand, { checker: true })
  flat(ground, rect(W - 1, N - 1, E + 1, S + 12), grass, 0, 1)
  for (const [x0, z0, x1, z1] of HUB.paths) flat(ground, rect(x0, z0, x1, z1), path, 0.06)
  const pz = HUB.plaza
  const outer = octagon(pz.radius + pz.ring)
  const inner = octagon(pz.radius)
  flat(ground, outer, path, 0.06)
  flat(ground, inner, sand, 0.14, 0.14)
  flat(ground, inner, lego(COLORS.yellow), 0.3, 0.3, [octagon(pz.radius - pz.border)])
  addFixed(RAPIER.ColliderDesc.convexHull(new Float32Array(inner.flatMap(([x, z]) => [x, 0.14, z, x, -0.2, z]))), { x: 0, y: 0, z: 0 })

  // Spawn pad: white slab with the yellow train logo on it.
  const pad = HUB.spawnPad
  blk(ground, lego(COLORS.white, { checker: true }), pad, 0.22, pad, 0, 0.14, 0)
  solidBox(pad / 2, 0.18, pad / 2, 0, 0.18, 0)
  const logo = lego(COLORS.yellow)
  const ly = 0.36
  const fw = 6.4
  const fd = 4.2
  const bar = 0.7
  blk(ground, logo, fw, 0.2, bar, 0, ly, -fd / 2 + bar / 2)
  blk(ground, logo, fw, 0.2, bar, 0, ly, fd / 2 - bar / 2)
  blk(ground, logo, bar, 0.2, fd, -fw / 2 + bar / 2, ly, 0)
  blk(ground, logo, bar, 0.2, fd, fw / 2 - bar / 2, ly, 0)
  blk(ground, logo, bar, 0.2, fd, 0, ly, 0)
  blk(ground, logo, fw, 0.2, bar * 0.8, 0, ly, 0)
  for (const s of [-1, 1]) {
    blk(ground, logo, 1.3, 0.2, 1.6, s * (fw / 2 + 0.6), ly, 0) // buffers
    blk(ground, logo, 1.6, 0.2, 0.9, s * 1.6, ly, fd / 2 + 0.4) // wheels
  }

  // Chevrons pointing up the north path at the gate.
  const cv = HUB.chevrons
  const white = lego(COLORS.white)
  for (let i = 0; i < cv.count; i++) {
    const z = cv.from - i * cv.step
    const hw = cv.width / 2
    const pts = [
      [-hw, z + 1.5],
      [0, z - 1.3],
      [hw, z + 1.5],
      [hw - 2.1, z + 1.5],
      [0, z + 0.15],
      [-hw + 2.1, z + 1.5],
    ]
    flat(ground, pts, white, 0.1, 0.04)
  }

  // --- Cliffs: the hub's walls, the plateau above, a second higher tier ---------------------
  const g = HUB.gate
  const lane = g.halfGap + 2 // the lane walls' outer faces
  cliff(walls, rand, W - T, -lane, N - T, N, H, 0, ['s']) // north, west of the gate
  cliff(walls, rand, lane, E + T, N - T, N, H, 0, ['s']) // north, east of the gate
  cliff(walls, rand, W - T, W, N, S, H, 0, ['e']) // west
  cliff(walls, rand, E, E + T, N, S, H, 0, ['w']) // east
  const lb = { x0: 2, x1: 28, back: S + 7 } // leaderboard alcove (see hubProps)
  cliff(walls, rand, W - T, lb.x0, S, S + T + 7, H, 0, ['n'])
  cliff(walls, rand, lb.x1, E + T, S, S + T + 7, H, 0, ['n'])
  cliff(walls, rand, lb.x0, lb.x1, lb.back, S + T + 7, H, 0, ['n'])
  solidBox((lane - (W - T)) / 2, H / 2, T / 2, (W - T - lane) / 2, H / 2, N - T / 2)
  solidBox((E + T - lane) / 2, H / 2, T / 2, (E + T + lane) / 2, H / 2, N - T / 2)
  solidBox(T / 2, H / 2, (S - N) / 2, W - T / 2, H / 2, (N + S) / 2)
  solidBox(T / 2, H / 2, (S - N) / 2, E + T / 2, H / 2, (N + S) / 2)
  solidBox((lb.x0 - (W - T)) / 2, H / 2, (T + 7) / 2, (W - T + lb.x0) / 2, H / 2, S + (T + 7) / 2)
  solidBox((E + T - lb.x1) / 2, H / 2, (T + 7) / 2, (E + T + lb.x1) / 2, H / 2, S + (T + 7) / 2)
  solidBox((lb.x1 - lb.x0) / 2, H / 2, T / 2, (lb.x0 + lb.x1) / 2, H / 2, lb.back + T / 2)
  // Alcove side walls (their faces look into the alcove).
  cliff(walls, rand, lb.x0 - 0.01, lb.x0 + 0.01, S, lb.back, H, 0, ['e'])
  cliff(walls, rand, lb.x1 - 0.01, lb.x1 + 0.01, S, lb.back, H, 0, ['w'])
  flat(ground, rect(lb.x0, S - 0.5, lb.x1, lb.back), lego(COLORS.dirtFloor), 0.08)

  // Plateau + tier two.
  const P = HUB.plateau
  const H2 = HUB.tier2Height
  const pw = W - T - P
  const pe = E + T + P
  const pn = N - T - P
  const ps = S + T + 7 + P
  const plateauTop = lego(COLORS.grass)
  flat(walls, rect(pw, pn, -lane, N - T), plateauTop, H, 0.5)
  flat(walls, rect(lane, pn, pe, N - T), plateauTop, H, 0.5)
  flat(walls, rect(pw, N - T, W - T, ps), plateauTop, H, 0.5)
  flat(walls, rect(E + T, N - T, pe, ps), plateauTop, H, 0.5)
  flat(walls, rect(W - T, S + T + 7, E + T, ps), plateauTop, H, 0.5)
  cliff(walls, rand, pw - T, -lane, pn - T, pn, H2 - H, H, ['s'])
  cliff(walls, rand, lane, pe + T, pn - T, pn, H2 - H, H, ['s'])
  cliff(walls, rand, pw - T, pw, pn, ps, H2 - H, H, ['e'])
  cliff(walls, rand, pe, pe + T, pn, ps, H2 - H, H, ['w'])
  cliff(walls, rand, pw - T, pe + T, ps, ps + T, H2 - H, H, ['n'])
  // Far grass to the horizon (four slabs round the tier-two rim, so the hub stays open to the sky).
  const F = HUB.farGround
  const far = lego(COLORS.leaf, { studs: false })
  flat(walls, rect(-F, -F, F, pn - T), far, H2, 0.5)
  flat(walls, rect(-F, ps + T, F, F), far, H2, 0.5)
  flat(walls, rect(-F, pn - T, pw - T, ps + T), far, H2, 0.5)
  flat(walls, rect(pe + T, pn - T, F, ps + T), far, H2, 0.5)

  // Trees: mostly along the first plateau, some on the far tier.
  const spots = []
  const ring = [
    () => [pw + 2 + rand() * (P - 4), N + rand() * (S - N)],
    () => [pe - 2 - rand() * (P - 4), N + rand() * (S - N)],
    () => [W + rand() * (E - W), pn + 2 + rand() * (P - 4)],
    () => [W + rand() * (E - W), ps - 2 - rand() * (P - 4)],
  ]
  for (let i = 0; i < HUB.trees * 4 && spots.length < HUB.trees; i++) {
    const [x, z] = ring[i % 4]()
    if (Math.abs(x) < lane + 4 && z < N) continue // keep the lane clear
    if (spots.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 11)) continue
    spots.push([x, z])
    tree(walls, rand, x, H, z, 0.9 + rand() * 0.35)
  }
  for (let i = 0; i < 12; i++) {
    const a = rand() * Math.PI * 2
    const r = 110 + rand() * 60
    tree(walls, rand, Math.cos(a) * r, H2, Math.sin(a) * r, 1.3)
  }

  // --- Gate, lane, waterfalls, fences, lamps -----------------------------------------------
  gate(walls)
  const scrolling = []
  for (const wf of HUB.waterfalls) scrolling.push(...waterfall(scene, walls, dynamic, wf.face, wf.at, wf.width))
  // Pool along the west cliff foot, with a white curb.
  const pool = HUB.pool
  const waterTex = toTexture(paintLaneWater(COLORS.water), { srgb: true })
  waterTex.repeat.set(pool.width / 4, (pool.z1 - pool.z0) / 4)
  const water = new Mesh(new PlaneGeometry(pool.width, pool.z1 - pool.z0), new MeshStandardMaterial({ map: waterTex, roughness: 0.15, metalness: 0, emissive: '#0a4fa0', emissiveIntensity: 0.35 }))
  water.rotation.x = -Math.PI / 2
  water.position.set(W + pool.width / 2, 0.16, (pool.z0 + pool.z1) / 2)
  water.receiveShadow = true
  dynamic.add(water)
  const curb = lego(COLORS.white)
  blk(walls, curb, 0.6, 0.45, pool.z1 - pool.z0 + 0.6, W + pool.width + 0.3, 0, (pool.z0 + pool.z1) / 2)
  blk(walls, curb, pool.width, 0.45, 0.6, W + pool.width / 2, 0, pool.z0 - 0.3)
  blk(walls, curb, pool.width, 0.45, 0.6, W + pool.width / 2, 0, pool.z1 + 0.3)
  // A small basin under the north fall.
  const nf = HUB.waterfalls.find((w) => w.face === 'north')
  if (nf) {
    const basin = new Mesh(new PlaneGeometry(nf.width + 2, 3), water.material)
    basin.rotation.x = -Math.PI / 2
    basin.position.set(nf.at, 0.16, N + 1.5)
    dynamic.add(basin)
    blk(walls, curb, nf.width + 3, 0.45, 0.6, nf.at, 0, N + 3.3)
  }
  for (const [x0, z0, x1, z1] of HUB.fences) fence(walls, x0, z0, x1, z1)
  const lampBulbs = []
  for (const [x, z, light] of HUB.lamps) {
    const bulb = lampPost(walls, x, z)
    solidBox(0.45, 2.4, 0.45, x, 2.4, z)
    if (light) lampBulbs.push([x, 4.2, z])
  }

  // Outer collision: the floor slab (the plaza and pad have their own above).
  addFixed(RAPIER.ColliderDesc.cuboid(90, 1, 100), { x: 0, y: -1, z: -20 }, null, { friction: 0.9 })

  bakeInto(scene, ground, false)
  bakeInto(scene, walls, true)

  return {
    lampBulbs,
    update(dt, elapsed) {
      for (const t of scrolling) t.offset.y = elapsed * 0.9
      waterTex.offset.y = -elapsed * 0.12
      waterTex.offset.x = Math.sin(elapsed * 0.4) * 0.05
    },
  }
}
