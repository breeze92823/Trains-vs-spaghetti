import {
  AdditiveBlending,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NormalBlending,
  PlaneGeometry,
  PointLight,
  Shape,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
} from 'three'
import { COLORS, DISPLAY, DISPLAY_TRAINS, HUB, LEADERBOARDS, PUMPKIN, RAMPS, STALLS, TREADMILL, TREADMILLS, WORLDS_PORTAL } from './config.js'
import { bake } from './bake.js'
import { RAPIER, addFixed } from './physics.js'
import { blk, cbox, lego, plastic, wedgeGeo } from './lego.js'
import { neon, solidBox, yawQuat } from './propkit.js'
import { createEmitter } from './particles.js'
import { sign } from './signs.js'
import { buildTrain } from './trains.js'
import { formatNumber, shortNumber } from './game.js'
import { mulberry32, toTexture } from './textures.js'

// The hub's set pieces: the two "best train" launch ramps by the gate, the
// Titles / Railcars stalls, the seven treadmills on the east side (buildTreadmill
// is shared with the lane's rooms), the tiered
// Trains display on the west side, the three leaderboards in the south cliff,
// the Worlds portal and the jack-o'-lantern. Static parts are baked; belts,
// swirls, the portal and the signs that change stay live.

const { west: W, east: E, north: N, south: S } = HUB.bounds

function bakeInto(scene, group) {
  const out = bake(group, true)
  out.traverse((o) => {
    if (o.isMesh) o.receiveShadow = true
  })
  scene.add(out)
  return out
}

// Fixed convex hull from world points [[x, y, z], ...].
function solidHull(points) {
  addFixed(RAPIER.ColliderDesc.convexHull(new Float32Array(points.flat())), { x: 0, y: 0, z: 0 })
}

// Yaw that turns a +Z-facing model toward (tx, tz).
const faceToward = (x, z, tx = 0, tz = 0) => Math.atan2(tx - x, tz - z)

// --- Swirl: streaks of wind circling a showcased train -------------------------------------
let tailTex = null
function tailTexture() {
  if (tailTex) return tailTex
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 4
  const ctx = c.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 256, 0)
  g.addColorStop(0, 'rgba(255,255,255,0)')
  g.addColorStop(0.75, 'rgba(255,255,255,0.7)')
  g.addColorStop(1, 'rgba(255,255,255,1)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 4)
  tailTex = new CanvasTexture(c)
  return tailTex
}
function swirl({ color, additive }, radius = 1.7) {
  const group = new Group()
  const mat = additive
    ? neon(color, 2.4, { alphaMap: tailTexture(), transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide })
    : new MeshBasicMaterial({ color, alphaMap: tailTexture(), transparent: true, opacity: 0.75, blending: NormalBlending, depthWrite: false, side: DoubleSide })
  const arcs = []
  for (let i = 0; i < 4; i++) {
    const r = radius * (0.85 + i * 0.12)
    const arc = new Mesh(new TorusGeometry(r, 0.06 + (i % 2) * 0.03, 4, 40, Math.PI * (1.1 + i * 0.15)), mat)
    arc.position.z = (i - 1.5) * 0.9
    arc.rotation.z = i * 1.7
    arc.renderOrder = 4
    arcs.push({ mesh: arc, speed: 4.5 + i * 1.3 })
    group.add(arc)
  }
  group.userData.update = (dt) => {
    for (const a of arcs) a.mesh.rotation.z -= a.speed * dt
  }
  return group
}

// --- Track pieces --------------------------------------------------------------------------
// Sleepers + two rails along local X, centred, `len` long, on y = 0 of `parent`.
function track(parent, len, { gauge = 1.1, sleeperColor = COLORS.sleeper, railColor = COLORS.rail, sleeperWidth = 3.2, spacing = 1.05 } = {}) {
  const sl = lego(sleeperColor)
  const rl = lego(railColor, { rough: 0.4 })
  const n = Math.floor(len / spacing)
  for (let i = 0; i < n; i++) blk(parent, sl, 0.5, 0.16, sleeperWidth, -len / 2 + (i + 0.5) * (len / n), 0, 0)
  for (const z of [-gauge, gauge]) blk(parent, rl, len, 0.2, 0.2, 0, 0.16, z)
}

// --- Ramps ---------------------------------------------------------------------------------------
function buildRamps(scene, statics, live, swirls) {
  const L = 7.5
  const Wd = 4.2
  const Hh = 4.6
  const slots = [] // shop prompts for the ramp trains (shop.js); no plinth, so ramp: true
  for (const r of RAMPS) {
    const s = r.side
    slots.push({ entry: r, x: r.x, z: r.z, top: 1.5, yaw: 0, ramp: true })
    blk(statics, lego(COLORS.yellowDark), L + 1.6, 0.4, Wd + 1.2, r.x, 0, r.z)
    const ramp = new Mesh(wedgeGeo(L, Wd, Hh), lego(COLORS.yellow))
    ramp.position.set(r.x - s * (L / 2), 0.4, r.z)
    if (s < 0) ramp.rotation.y = Math.PI
    ramp.castShadow = ramp.receiveShadow = true
    statics.add(ramp)
    // Darker yellow end block under the high end.
    blk(statics, lego(COLORS.yellowDark), 0.8, Hh, Wd + 0.3, r.x + s * (L / 2 - 0.4), 0.4, r.z)
    const xl = r.x - s * (L / 2)
    const xh = r.x + s * (L / 2)
    solidHull([
      [xl, 0.4, r.z - Wd / 2], [xl, 0.4, r.z + Wd / 2], [xh, 0.4, r.z - Wd / 2], [xh, 0.4, r.z + Wd / 2], [xh, 0.4 + Hh, r.z - Wd / 2], [xh, 0.4 + Hh, r.z + Wd / 2],
    ])
    solidBox((L + 1.6) / 2, 0.2, (Wd + 1.2) / 2, r.x, 0.2, r.z)
    // Track up the slope, and the train riding it.
    const angle = Math.atan2(Hh, L)
    const slope = new Group()
    slope.position.set(r.x, 0.4 + Hh / 2 + 0.02, r.z)
    slope.rotation.z = s * angle
    track(slope, Math.hypot(L, Hh) - 0.2, { gauge: 0.68, sleeperWidth: 2.2, spacing: 0.9 })
    const train = buildTrain(r.train)
    train.position.set(s * 0.9, 0.34, 0)
    train.rotation.y = s * (Math.PI / 2)
    slope.add(train)
    statics.add(slope)
    // Wind swirl round the train's long axis + sparkles.
    const sw = swirl(r.swirl)
    const holder = new Group()
    holder.position.set(r.x + s * 0.9 * Math.cos(angle), 0.4 + Hh / 2 + 1.3 + s * 0.9 * Math.sin(angle) * s, r.z)
    holder.rotation.set(0, (s * Math.PI) / 2, 0)
    const tilt = new Group()
    tilt.rotation.x = -angle
    tilt.add(sw)
    holder.add(tilt)
    live.add(holder)
    swirls.push(sw)
    createEmitter(scene, {
      boxes: [{ x: holder.position.x, y: holder.position.y, z: r.z, sx: 2.2, sy: 1.2, sz: 1.4 }],
      count: 30,
      life: 1.1,
      velocity: [-s * 2.5, 1.2, 0],
      spread: [1, 0.6, 0.8],
      size: 0.4,
      color: r.swirl.additive ? '#ffffff' : '#fff9c0',
      intensity: 2.6,
      sprite: 'sparkle',
      twinkle: 9,
      seed: Math.round(r.x * 31),
    })
    const label = sign([{ text: `X${r.mult} Best`, color: r.tag, size: 1.15 }, { text: r.name, color: '#ffffff', size: 0.85 }], 1.45)
    label.position.set(r.x + s * 1.5, 8.6, r.z)
    live.add(label)
    const price = sign([{ icon: 'trophy', text: `${shortNumber(r.wins)} Wins`, color: ['#fff27a', '#ffbf1a'], size: 0.9 }, { text: `+${shortNumber(r.power)} Power`, color: ['#c8ffa0', '#3fe05a'], size: 0.7 }], 0.85)
    price.position.set(r.x + s * 1.5, 6.6, r.z)
    live.add(price)
  }
  return slots
}

// --- Stalls ---------------------------------------------------------------------------------------
function buildStalls(statics, live) {
  const locks = []
  for (const st of STALLS) {
    const g = new Group()
    g.position.set(st.x, 0, st.z)
    g.rotation.y = faceToward(st.x, st.z, 0, 0)
    // Mat with a coloured border.
    blk(g, lego(COLORS.white, { checker: true }), 7.4, 0.1, 6.4, 0, 0.02, 0)
    const border = lego(st.mat)
    blk(g, border, 7.8, 0.16, 0.45, 0, 0.02, 3.4)
    blk(g, border, 7.8, 0.16, 0.45, 0, 0.02, -3.4)
    blk(g, border, 0.45, 0.16, 7.2, 3.9, 0.02, 0)
    blk(g, border, 0.45, 0.16, 7.2, -3.9, 0.02, 0)
    // Counter: dark wood on legs, lighter top, little crates on it.
    const wood = lego(COLORS.wood)
    const woodL = lego(COLORS.woodLight)
    blk(g, wood, 5.2, 1.0, 1.3, 0, 0.12, 0.9)
    blk(g, woodL, 5.6, 0.18, 1.6, 0, 1.12, 0.9)
    blk(g, lego('#3d2310'), 5.0, 0.2, 0.05, 0, 0.5, 1.56)
    for (const [cx, col] of [[-1.6, st.stripe], [0.2, '#ffd21a'], [1.7, '#ffffff']]) blk(g, lego(col), 0.6, 0.45, 0.6, cx, 1.3, 0.8)
    // Posts + striped awning sloping toward the front.
    for (const [px, pz] of [[-2.7, 1.55], [2.7, 1.55], [-2.7, -1.7], [2.7, -1.7]]) blk(g, wood, 0.32, pz > 0 ? 3.25 : 4.05, 0.32, px, 0.12, pz)
    const roof = new Group()
    roof.position.set(0, 3.8, -0.05)
    roof.rotation.x = Math.atan2(0.85, 3.9)
    const n = 8
    const sw = 6.2 / n
    for (let i = 0; i < n; i++) blk(roof, lego(i % 2 ? COLORS.white : st.stripe), sw, 0.18, 4.1, -3.1 + (i + 0.5) * sw, 0, 0)
    for (let i = 0; i < n; i++) blk(roof, lego(i % 2 ? COLORS.white : st.stripe), sw, 0.55, 0.14, -3.1 + (i + 0.5) * sw, -0.5, 2.05)
    g.add(roof)
    statics.add(g)
    g.updateMatrixWorld(true)
    solidBox(2.8, 0.65, 0.8, st.x, 0.65, st.z, g.rotation.y)
    const label = sign([{ text: st.name, color: st.labelColor, outline: st.labelOutline, size: 1 }], 1.25)
    label.position.set(st.x, 5.6, st.z)
    live.add(label)
    if (st.lock) {
      const lock = sign([{ icon: 'lock', text: '', size: 1.3 }, { text: `REBIRTH ${st.lock}`, color: '#ffffff', size: 0.9 }], 0.9)
      lock.position.set(st.x, 1.6, st.z)
      lock.visible = false
      live.add(lock)
      locks.push({ sprite: lock, x: st.x, z: st.z })
    }
  }
  return locks
}

// --- Treadmills -----------------------------------------------------------------------------------
function paintBelt(kind, frame) {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 256
  const ctx = c.getContext('2d')
  const rand = mulberry32(kind.length * 97)
  const bg = {
    plain: '#f0f0f2', water: '#2a8cff', waves: '#ff3030', planks: '#ffc81a', ice: '#bfe9ff', void: '#2a0f45', glow: '#9ff6ff',
  }[kind]
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, 128, 256)
  if (kind === 'water' || kind === 'ice') {
    ctx.strokeStyle = 'rgba(255,255,255,0.65)'
    ctx.lineWidth = 3
    for (let i = 0; i < 10; i++) {
      const y0 = (i / 10) * 256
      ctx.beginPath()
      for (let x = 0; x <= 128; x += 8) ctx.lineTo(x, y0 + Math.sin(x / 13 + i) * 4)
      ctx.stroke()
    }
  }
  if (kind === 'waves') {
    for (let i = 0; i < 8; i++) {
      ctx.strokeStyle = i % 2 ? '#ffd9a0' : '#c81a1a'
      ctx.lineWidth = 9
      const y0 = (i / 8) * 256
      ctx.beginPath()
      for (let x = -8; x <= 136; x += 8) ctx.lineTo(x, y0 + Math.sin(x / 16) * 10)
      ctx.stroke()
    }
  }
  if (kind === 'glow') {
    const g = ctx.createLinearGradient(0, 0, 128, 0)
    g.addColorStop(0, '#5fe0ff')
    g.addColorStop(0.5, '#ffffff')
    g.addColorStop(1, '#5fe0ff')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 128, 256)
  }
  // Sleepers across the belt (these are what visibly run).
  const sleeper = { plain: '#7d6a5c', water: '#6e4120', waves: '#7a7a82', planks: '#ff8a1a', ice: '#ffffff', void: '#050508', glow: '#e8ffff' }[kind]
  for (let i = 0; i < 4; i++) {
    const y = i * 64 + 18
    ctx.fillStyle = sleeper
    ctx.fillRect(6, y, 116, kind === 'void' ? 26 : 20)
    ctx.fillStyle = 'rgba(0,0,0,0.18)'
    ctx.fillRect(6, y + (kind === 'void' ? 22 : 16), 116, 4)
  }
  // Plain belt: pale grey chevrons between the sleepers pointing the way the belt runs (canvas top = the low end).
  if (kind === 'plain') {
    ctx.strokeStyle = '#a9acb8'
    ctx.lineWidth = 7
    ctx.lineJoin = ctx.lineCap = 'round'
    for (let i = 0; i < 4; i++) {
      const y = i * 64 + 60
      ctx.beginPath()
      ctx.moveTo(64 - 26, y + 9)
      ctx.lineTo(64, y - 7)
      ctx.lineTo(64 + 26, y + 9)
      ctx.stroke()
    }
  }
  if (kind === 'void') {
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(200,120,255,${0.3 + rand() * 0.5})`
      ctx.fillRect(rand() * 128, rand() * 256, 2, 2)
    }
  }
  void frame
  return c
}

// One treadmill: a deck wedge rising along `dir` (+1 = toward +X, -1 = toward -X)
// from (cx - dir * len / 2) to the headboard at (cx + dir * len / 2), centred on cz.
// Static parts go to `statics` (baked), the scrolling belt and the label to `live`.
// Returns { zone, tex } (zone feeds game.js, tex scrolls each frame).
export function buildTreadmill(scene, statics, live, cfg, { cx, cz, dir = 1, len = TREADMILL.x1 - TREADMILL.x0, w = TREADMILL.width, rise = TREADMILL.rise, index = 0 }) {
  const g = new Group()
  g.position.set(cx, 0, cz)
  g.rotation.y = dir > 0 ? 0 : Math.PI
  g.updateMatrixWorld(true)
  const at = (x, y, z) => g.localToWorld(new Vector3(x, y, z))
  const x0 = -len / 2
  const x1 = len / 2
  const angle = Math.atan2(rise, len)
  const slopeLen = Math.hypot(len, rise)
  const frame = lego(cfg.frame, cfg.glow ? { emissive: cfg.glow, emissiveIntensity: 0.25 } : undefined)
  const bar = lego(cfg.bar)
  // Deck: a wedge rising toward the headboard.
  const deck = new Mesh(wedgeGeo(len, w, rise), frame)
  deck.position.set(x0, 0, 0)
  deck.castShadow = deck.receiveShadow = true
  g.add(deck)
  solidHull([at(x0, 0, -w / 2), at(x0, 0, w / 2), at(x1, 0, -w / 2), at(x1, 0, w / 2), at(x1, rise, -w / 2), at(x1, rise, w / 2)].map((v) => [v.x, v.y, v.z]))
  // Sloped side rails and the track rails along the belt.
  const slope = new Group()
  slope.position.set(0, rise / 2, 0)
  slope.rotation.z = angle
  for (const s of [-1, 1]) {
    blk(slope, frame, slopeLen, 0.55, 0.75, 0, 0, s * (w / 2 - 0.37))
    blk(slope, lego(cfg.rail, { rough: 0.4 }), slopeLen - 0.4, 0.22, 0.28, 0, 0.02, s * 1.15)
  }
  g.add(slope)
  // Headboard: two posts and striped bars.
  for (const s of [-1, 1]) blk(g, frame, 0.9, 4.6, 0.9, x1 - 0.2, rise - 0.2, s * (w / 2 - 0.45))
  for (let k = 0; k < 3; k++) blk(g, k % 2 ? lego(COLORS.white) : bar, 0.6, 0.6, w - 1.7, x1 - 0.2, rise + 0.9 + k * 1.15, 0)
  blk(g, frame, 0.95, 0.35, w + 0.3, x1 - 0.2, rise + 4.4, 0)
  const hb = at(x1 - 0.2, rise + 2.2, 0)
  solidBox(0.45, 2.4, w / 2, hb.x, hb.y, hb.z, g.rotation.y)
  if (cfg.glow) {
    const light = neon(cfg.glow, 3)
    for (const s of [-1, 1]) blk(g, light, 0.12, 4.2, 0.12, x1 - 0.7, rise, s * (w / 2 - 0.9)).castShadow = false
    const c = at(1, rise + 1.2, 0)
    createEmitter(scene, {
      boxes: [{ x: c.x, y: c.y, z: c.z, sx: len / 2 - 1, sy: 1.2, sz: w / 2 - 0.8 }],
      count: 46,
      life: 1.8,
      velocity: [-1.2 * dir, 1.4, 0],
      spread: [1, 0.8, 1],
      size: 0.45,
      color: cfg.glow,
      intensity: 2.6,
      sprite: 'sparkle',
      twinkle: 8,
      seed: 900 + index,
    })
  }
  statics.add(g)
  // The belt (live: its texture scrolls toward the low end).
  const tex = toTexture(paintBelt(cfg.belt, cfg.frame), { srgb: true })
  tex.repeat.set(1, slopeLen / 3)
  const glowy = cfg.belt === 'glow' || cfg.belt === 'void'
  const beltMat = new MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: glowy ? '#ffffff' : '#000000', emissiveMap: glowy ? tex : null, emissiveIntensity: cfg.belt === 'glow' ? 1.6 : 0.6 })
  const beltGeo = new PlaneGeometry(w - 1.5, slopeLen)
  beltGeo.rotateX(-Math.PI / 2)
  beltGeo.rotateY(Math.PI / 2)
  const holder = new Group()
  holder.position.copy(g.position)
  holder.rotation.copy(g.rotation)
  const belt = new Mesh(beltGeo, beltMat)
  belt.position.set(0, rise / 2 + 0.03, 0)
  belt.rotation.z = angle
  belt.receiveShadow = true
  holder.add(belt)
  live.add(holder)
  // Label over the headboard.
  const lines = []
  if (cfg.price) lines.push({ text: `${cfg.price}`, icon: 'gem', iconRight: true, color: '#ffffff', size: 1 })
  else if (cfg.cost) lines.push({ text: `${cfg.cost}`, icon: 'rebirth', iconRight: true, color: '#ffffff', size: 1.1 })
  lines.push({ text: `${cfg.mult}x Power`, color: cfg.price ? '#5dff6a' : '#ffffff', size: cfg.cost || cfg.price ? 0.7 : 0.9 })
  const label = sign(lines, 1.3)
  label.position.copy(at(x1 - 1.2, rise + 5.2, 0))
  live.add(label)
  const ax = cx - dir * (len / 2)
  const bx = cx + dir * (len / 2)
  return {
    // dir: the headboard's side (+1 = +X); angle: belt slope (training.js runs the train on it).
    zone: { index, mult: cfg.mult, cost: cfg.cost ?? 0, price: cfg.price ?? 0, x0: Math.min(ax, bx), x1: Math.max(ax, bx), z0: cz - w / 2 + 0.6, z1: cz + w / 2 - 0.6, cx, cz, dir, angle },
    tex,
  }
}

function buildTreadmills(scene, statics, live) {
  const T = TREADMILL
  const zones = []
  const belts = []
  TREADMILLS.forEach((cfg, i) => {
    const t = buildTreadmill(scene, statics, live, cfg, { cx: (T.x0 + T.x1) / 2, cz: T.z[i], dir: 1, index: i })
    zones.push(t.zone)
    belts.push(t.tex)
  })
  const treadSign = sign([{ text: 'Treadmills', color: '#ffffff', size: 1 }], 6.5, { outline: 16 })
  treadSign.position.set(E - 2, 15.5, (T.z[0] + T.z[T.z.length - 1]) / 2)
  live.add(treadSign)
  return { zones, belts }
}

// --- Trains display -------------------------------------------------------------------------------
function buildDisplay(statics, live) {
  const D = DISPLAY
  const white = lego(COLORS.white, { checker: true })
  const wood = lego(COLORS.wood)
  const gray = lego('#c9c9cf')
  const tiers = DISPLAY_TRAINS.length
  const slots = [] // one per train, for the shop (shop.js): world pad centre + facing
  const z0 = -D.halfWidth
  const z1 = D.halfWidth
  for (let k = 0; k < tiers; k++) {
    const top = D.base + k * D.rise
    const xf = D.front - k * D.depth
    blk(statics, white, xf - D.back, top, z1 - z0, (xf + D.back) / 2, 0, 0)
    blk(statics, wood, 0.5, 0.3, z1 - z0 + 0.2, xf - 0.1, top - 0.15, 0) // brown lip
    blk(statics, gray, 0.2, top - 0.3, z1 - z0, xf + 0.05, 0, 0)
    solidBox((xf - D.back) / 2, top / 2, (z1 - z0) / 2, (xf + D.back) / 2, top / 2, 0)
    // A full-width track along the foot of the next tier's riser (the rails between the rows).
    if (k < tiers - 1) {
      const rails = new Group()
      rails.position.set(xf - D.depth + 0.55, top, 0)
      rails.rotation.y = Math.PI / 2
      track(rails, z1 - z0 - 0.4, { gauge: 0.32, sleeperWidth: 0.95, spacing: 0.62, railColor: '#8a8a92' })
      statics.add(rails)
    }
    DISPLAY_TRAINS[k].forEach((entry, i) => {
      const x = xf - D.padInset
      const z = -(D.z0 + i * D.dz) // cheapest on the left as seen from the plaza
      const yaw = faceToward(x, z, 0, 0)
      const pad = new Group()
      pad.position.set(x, top, z)
      pad.rotation.y = yaw
      // Dark plinth (the state-coloured top is live, shop.js), a short display track with
      // sleepers under the wheels and a buffer stop behind the train.
      blk(pad, lego('#3a3d48'), D.padW, 0.22, D.padL, 0, 0, 0)
      const short = new Group()
      short.position.y = D.padTop
      short.rotation.y = Math.PI / 2
      track(short, D.padL - 0.5, { gauge: 0.68 * D.trainScale, sleeperWidth: D.padW - 0.9, spacing: 0.72, railColor: '#a2a2aa' })
      pad.add(short)
      const bz = -D.padL / 2 + 0.2
      blk(pad, lego('#ff3b3b'), D.padW - 1.2, 0.42, 0.3, 0, D.padTop, bz)
      for (const s of [-1, 1]) {
        blk(pad, lego('#3a3d48'), 0.22, 0.75, 0.22, s * (D.padW / 2 - 0.75), D.padTop, bz - 0.1)
        blk(pad, lego('#ffd21a'), 0.34, 0.3, 0.2, s * 0.62, D.padTop + 0.08, bz + 0.25)
      }
      const train = buildTrain(entry.train)
      train.scale.setScalar(D.trainScale) // showcase size
      train.position.y = D.padTop + 0.36 // wheels on the rails
      pad.add(train)
      statics.add(pad)
      const label = sign(
        [
          { icon: 'trophy', text: `${shortNumber(entry.wins)} Wins`, color: ['#fff27a', '#ffbf1a'], size: 1 },
          { text: `+${shortNumber(entry.power)} Power`, color: ['#c8ffa0', '#3fe05a'], size: 0.78 },
        ],
        0.95,
      )
      label.position.set(x, top + 3.3, z)
      live.add(label)
      slots.push({ index: slots.length, entry, x, z, top, yaw })
    })
  }
  // Side stairs: a white stringer climbing west with a railway "ladder" up it.
  const topY = D.base + (tiers - 1) * D.rise
  const run = D.front - D.back
  const angle = Math.atan2(topY, run)
  for (const s of [-1, 1]) {
    const zc = s * (D.halfWidth + D.stairWidth / 2)
    const stringer = new Mesh(wedgeGeo(run, D.stairWidth, topY), lego(COLORS.white))
    stringer.position.set(D.front, 0, zc)
    stringer.rotation.y = Math.PI
    stringer.castShadow = stringer.receiveShadow = true
    statics.add(stringer)
    solidHull([
      [D.front, 0, zc - D.stairWidth / 2], [D.front, 0, zc + D.stairWidth / 2], [D.back, 0, zc - D.stairWidth / 2], [D.back, 0, zc + D.stairWidth / 2], [D.back, topY, zc - D.stairWidth / 2], [D.back, topY, zc + D.stairWidth / 2],
    ])
    const ladder = new Group()
    ladder.position.set((D.front + D.back) / 2, topY / 2 + 0.02, zc)
    ladder.rotation.z = -angle
    track(ladder, Math.hypot(run, topY) - 0.4, { gauge: D.stairWidth / 2 - 0.35, sleeperWidth: D.stairWidth - 0.4, spacing: 1.2, railColor: '#8a8a92' })
    statics.add(ladder)
    // Low gray side wall on the outer edge.
    const wall = new Group()
    wall.position.copy(ladder.position)
    wall.rotation.z = -angle
    blk(wall, gray, Math.hypot(run, topY), 0.8, 0.35, 0, 0, s * (D.stairWidth / 2 + 0.1))
    statics.add(wall)
  }
  const title = sign([{ text: 'Trains', color: ['#ffffff', '#dfe6ff'], size: 1 }], 7, { outline: 16 })
  title.position.set(D.back + 3, 15.5, 0)
  live.add(title)
  return slots
}

// --- Leaderboards -----------------------------------------------------------------------------------
const NAMES = ['RailRunner', 'SteamQueen', 'ChooChooMax', 'LocoLegend', 'TrackStar99', 'DieselDan', 'BoilerBoss', 'CabooseKid', 'Sparky_TT']
const VALUES = [
  ['43.1K', '32.7K', '22.4K', '18.4K', '15.3K', '13.4K', '10.1K'],
  ['9.2Qi', '315.4Qa', '81Qa', '23.2Qa', '13.2Qa', '7.4Qa', '6.1Qa'],
  ['6.2K', '2.8K', '2.6K', '2.6K', '2.2K', '2K', '1.8K'],
]
// Row values: counts through formatNumber, playtime (s) as "3h 20m".
function boardValue(stat, v) {
  if (stat !== 'playtime') return formatNumber(v)
  const m = Math.floor(v / 60)
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${Math.max(1, m)}m`
}
// Profile pictures for the rows: drawn once loaded (CORS-clean, else the coloured initial stays).
const pfpCache = new Map()
function pfpImage(url, onLoad) {
  if (!url) return null
  let e = pfpCache.get(url)
  if (!e) {
    e = { img: new Image(), ok: false }
    e.img.crossOrigin = 'anonymous'
    e.img.onload = () => {
      e.ok = true
      onLoad()
    }
    e.img.src = url
    pfpCache.set(url, e)
  }
  return e.ok ? e.img : null
}
// rows: [{ name, value, pfp }] from the server / Bloxity, or null for the placeholder look.
function paintBoard(cfg, b, rows = null, onPfp = () => {}) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 440
  paintBoardInto(c, cfg, b, rows, onPfp)
  return c
}
function paintBoardInto(c, cfg, b, rows, onPfp) {
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#25272d'
  ctx.fillRect(0, 0, 512, 440)
  ctx.fillStyle = cfg.header
  ctx.fillRect(0, 0, 512, 56)
  ctx.font = '700 34px Fredoka, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#1b1b22'
  ctx.fillText(cfg.title, 256, 30)
  const rand = mulberry32(31 + b * 7)
  const names = [...NAMES].sort(() => rand() - 0.5)
  const live = Array.isArray(rows)
  if (live && !rows.length) {
    ctx.fillStyle = '#9aa0ae'
    ctx.font = '600 28px Fredoka, sans-serif'
    ctx.fillText('No scores yet', 256, 240)
    return
  }
  for (let r = 0; r < 7; r++) {
    const row = live ? rows[r] : null
    if (live && !row) break
    const y = 66 + r * 52
    ctx.fillStyle = r % 2 ? '#2c2f36' : '#34373f'
    ctx.fillRect(8, y, 496, 48)
    ctx.textAlign = 'left'
    ctx.font = '700 24px Fredoka, sans-serif'
    ctx.fillStyle = r === 0 ? '#ffd21a' : r === 1 ? '#d8dce6' : r === 2 ? '#e09a5a' : '#ffffff'
    ctx.fillText(`${r + 1}`, 20, y + 25)
    const name = row ? String(row.name || 'Player') : names[r]
    const img = row ? pfpImage(row.pfp, onPfp) : null
    if (img) {
      ctx.save()
      ctx.beginPath()
      ctx.arc(64, y + 24, 15, 0, Math.PI * 2)
      ctx.clip()
      ctx.drawImage(img, 49, y + 9, 30, 30)
      ctx.restore()
    } else {
      ctx.fillStyle = `hsl(${row ? [...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7) : Math.floor(rand() * 360)} 70% 60%)`
      ctx.beginPath()
      ctx.arc(64, y + 24, 15, 0, Math.PI * 2)
      ctx.fill()
      if (row) {
        ctx.fillStyle = '#1b1b22'
        ctx.font = '700 18px Fredoka, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(name.charAt(0).toUpperCase(), 64, y + 25)
        ctx.textAlign = 'left'
      }
    }
    ctx.fillStyle = '#f2f2f6'
    ctx.font = '600 25px Fredoka, sans-serif'
    let shown = name
    while (shown.length > 3 && ctx.measureText(shown).width > 270) shown = shown.slice(0, -2)
    ctx.fillText(shown === name ? name : `${shown}…`, 92, y + 25)
    ctx.textAlign = 'right'
    ctx.fillStyle = '#ffffff'
    ctx.fillText(row ? boardValue(cfg.stat, row.value) : VALUES[b][r], 490, y + 25)
  }
}
function buildLeaderboards(statics, live) {
  const LB = LEADERBOARDS
  const n = LB.boards.length
  const textures = []
  LB.boards.forEach((cfg, b) => {
    const off = b - (n - 1) / 2
    const x = LB.x + off * 7.6
    const z = S + LB.depth - 2.2 - Math.abs(off) * 0.9
    const yaw = Math.PI - off * 0.38
    const g = new Group()
    g.position.set(x, 0, z)
    g.rotation.y = yaw
    blk(g, lego('#3a3c44'), 0.4, 1.8, 0.4, -2.6, 0, 0)
    blk(g, lego('#3a3c44'), 0.4, 1.8, 0.4, 2.6, 0, 0)
    blk(g, lego(COLORS.white), 7.2, 6.0, 0.5, 0, 1.6, 0)
    statics.add(g)
    const canvas = paintBoard(cfg, b)
    const tex = new CanvasTexture(canvas)
    tex.colorSpace = SRGBColorSpace
    tex.anisotropy = 4
    textures.push({ tex, canvas, cfg, b, x, z, yaw })
    const panel = new Mesh(new PlaneGeometry(6.7, 5.5), new MeshBasicMaterial({ map: tex }))
    panel.position.set(x + Math.sin(yaw) * 0.27, 4.6, z + Math.cos(yaw) * 0.27)
    panel.rotation.y = yaw
    live.add(panel)
    solidBox(3.6, 3.8, 0.4, x, 3.8, z, yaw)
  })
  return textures
}

// --- Worlds portal ---------------------------------------------------------------------------------
function buildPortal(scene, statics, live) {
  const { x, z } = WORLDS_PORTAL
  const g = new Group()
  g.position.set(x, 0, z)
  g.rotation.y = Math.PI // faces north, toward the plaza
  const white = lego(COLORS.white)
  const pale = lego('#dfe7ef')
  blk(g, lego('#5a5d66'), 10, 0.5, 5.6, 0, 0, 0)
  for (const s of [-1, 1]) {
    blk(g, white, 1.8, 7.2, 3.2, s * 3.8, 0.5, -0.2)
    blk(g, pale, 2.2, 0.6, 3.6, s * 3.8, 0.5, -0.2)
    blk(g, neon('#7fe6ff', 2.6), 0.14, 6.2, 0.14, s * 2.86, 0.9, 1.2).castShadow = false
  }
  blk(g, white, 9.8, 1.6, 3.4, 0, 7.7, -0.2)
  blk(g, pale, 10.6, 0.6, 3.9, 0, 9.3, -0.2)
  blk(g, white, 7, 0.6, 3.2, 0, 9.9, -0.2)
  blk(g, lego('#2a2c33'), 6, 7.2, 0.6, 0, 0.5, -1.6) // dark back
  // Rails running out of the portal.
  const tr = new Group()
  tr.position.set(0, 0.5, 2.2)
  tr.rotation.y = Math.PI / 2
  track(tr, 5.6, { gauge: 0.9, sleeperWidth: 2.6, sleeperColor: '#2a2a30', railColor: '#55555c', spacing: 0.9 })
  g.add(tr)
  statics.add(g)
  solidBox(5, 0.25, 2.8, x, 0.25, z)
  for (const s of [-1, 1]) solidBox(0.9, 4, 1.6, x - s * 3.8, 4, z + 0.2)
  solidBox(3, 4, 0.4, x, 4, z + 1.6)
  // The portal surface: a slow blue swirl, bright in the middle.
  const mat = new ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; varying vec2 vUv;
      void main(){
        vec2 p = vUv - 0.5; p.x *= 0.85;
        float r = length(p); float a = atan(p.y, p.x);
        float swirl = 0.5 + 0.5 * sin(a * 3.0 + r * 16.0 - uTime * 2.2);
        float rings = 0.5 + 0.5 * sin(r * 30.0 - uTime * 3.0);
        vec3 deep = vec3(0.02, 0.22, 0.95);
        vec3 light = vec3(0.45, 0.85, 1.0);
        vec3 col = mix(deep, light, swirl * 0.35 + rings * 0.1 + (1.0 - smoothstep(0.0, 0.55, r)) * 0.45);
        col += vec3(0.7, 0.95, 1.0) * pow(max(0.0, 1.0 - vUv.y), 3.0) * 0.25;
        gl_FragColor = vec4(col * 1.6, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
  const surface = new Mesh(new PlaneGeometry(5.6, 6.9), mat)
  surface.position.set(x, 4.0, z - 1.2)
  surface.rotation.y = Math.PI
  live.add(surface)
  const light = new PointLight('#4fb4ff', 18, 16, 2)
  light.position.set(x, 3.5, z - 3)
  scene.add(light)
  createEmitter(scene, {
    boxes: [{ x, y: 4, z: z - 1.6, sx: 2.6, sy: 3.2, sz: 0.3 }],
    count: 40,
    life: 2.2,
    velocity: [0, 0.3, -0.8],
    spread: [0.4, 0.4, 0.4],
    size: 0.35,
    color: '#ffffff',
    intensity: 2.8,
    sprite: 'sparkle',
    twinkle: 6,
    seed: 4242,
  })
  const label = sign([{ text: 'Worlds', color: ['#ffffff', '#e2e8ff'], size: 1 }], 2.9, { outline: 14 })
  label.position.set(x, 9.6, z - 2.3)
  live.add(label)
  return mat
}

// --- Pumpkin ---------------------------------------------------------------------------------------
function buildPumpkin(scene, statics) {
  const { x, z, radius: r } = PUMPKIN
  const g = new Group()
  g.position.set(x, 0, z)
  g.rotation.y = faceToward(x, z, 0, 0)
  blk(g, lego('#ffb21a'), r * 2.6, 0.32, r * 2.6, 0, 0, 0)
  blk(g, lego('#ff8a1a'), r * 2.2, 0.15, r * 2.2, 0, 0.32, 0)
  const orange = plastic('#ff7f12', { rough: 0.55 })
  const ridge = plastic('#e8650a', { rough: 0.6 })
  const cy = r * 0.85 + 0.45
  const core = new Mesh(new SphereGeometry(r, 28, 20), orange)
  core.scale.set(1.12, 0.84, 1.12)
  core.position.y = cy
  core.castShadow = true
  g.add(core)
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2
    const lobe = new Mesh(new SphereGeometry(r * 0.62, 18, 14), i % 2 ? orange : ridge)
    lobe.scale.set(0.62, 1.32, 0.9)
    lobe.position.set(Math.sin(a) * r * 0.62, cy, Math.cos(a) * r * 0.62)
    lobe.rotation.y = a
    lobe.castShadow = true
    g.add(lobe)
  }
  const stem = new Mesh(new CylinderGeometry(0.3, 0.42, 1.1, 8), plastic('#5a7a1a'))
  stem.position.set(0.1, cy + r * 0.82 + 0.3, 0)
  stem.rotation.z = -0.25
  g.add(stem)
  // Carved face: glowing triangles + a jagged grin on the front surface.
  const glowMat = neon('#ffbe2a', 2.8)
  const front = r * 1.12 * 1.02
  const facePart = (pts, px, py, depth = 0.5) => {
    const s = new Shape()
    pts.forEach(([a, b], i) => (i ? s.lineTo(a, b) : s.moveTo(a, b)))
    s.closePath()
    const geo = new ExtrudeGeometry(s, { depth, bevelEnabled: false })
    const m = new Mesh(geo, glowMat)
    const along = Math.sqrt(Math.max(0, 1 - (px / (r * 1.12)) ** 2 - ((py - cy) / (r * 0.84)) ** 2))
    m.position.set(px, py, front * along - depth * 0.55)
    g.add(m)
  }
  for (const s of [-1, 1]) facePart([[-0.55, -0.35], [0.55, -0.35], [0.1 * s, 0.55]], s * 0.95, cy + 0.45)
  facePart([[-0.25, -0.2], [0.25, -0.2], [0, 0.25]], 0, cy - 0.05)
  facePart(
    [[-1.5, 0.2], [-1.1, -0.15], [-0.75, 0.15], [-0.4, -0.2], [0, 0.1], [0.4, -0.2], [0.75, 0.15], [1.1, -0.15], [1.5, 0.2], [1.2, -0.55], [0.6, -0.8], [0, -0.7], [-0.6, -0.8], [-1.2, -0.55]],
    0,
    cy - 0.75,
  )
  statics.add(g)
  const light = new PointLight('#ff9a2a', 14, 12, 2)
  light.position.set(x + Math.sin(g.rotation.y) * (r + 1.2), cy, z + Math.cos(g.rotation.y) * (r + 1.2))
  scene.add(light)
  addFixed(RAPIER.ColliderDesc.cylinder(r * 0.9, r * 1.1), { x, y: r, z }, yawQuat(0))
  // A black street lamp beside it.
  const lx = x - 6
  const lz = z - 3
  const black = lego('#1d1d22')
  blk(statics, black, 0.9, 0.3, 0.9, lx, 0, lz)
  blk(statics, black, 0.3, 4.6, 0.3, lx, 0.3, lz)
  blk(statics, black, 0.8, 0.2, 0.8, lx, 4.9, lz)
  blk(statics, neon('#ffd84a', 2.6), 0.55, 0.7, 0.55, lx, 5.1, lz).castShadow = false
  blk(statics, black, 0.9, 0.25, 0.9, lx, 5.8, lz)
  solidBox(0.3, 2.4, 0.3, lx, 2.4, lz)
}

export function buildProps(scene) {
  const statics = new Group()
  const live = new Group()
  scene.add(live)
  const swirls = []
  const rampSlots = buildRamps(scene, statics, live, swirls)
  const locks = buildStalls(statics, live)
  const treads = buildTreadmills(scene, statics, live)
  const shopSlots = buildDisplay(statics, live)
  for (const s of rampSlots) shopSlots.push({ ...s, index: shopSlots.length }) // RedRush / Ironheart follow the display trains
  const boardTextures = buildLeaderboards(statics, live)
  const portal = buildPortal(scene, statics, live)
  buildPumpkin(scene, statics)
  bakeInto(scene, statics)

  // The three hub boards: setData({ stat: [{ name, value, pfp }] }) repaints them with the
  // server's / Bloxity's top lists (null keeps the placeholder look).
  let boardData = null
  const repaintBoards = () => {
    for (const t of boardTextures) {
      paintBoardInto(t.canvas, t.cfg, t.b, boardData?.[t.cfg.stat] ?? null, repaintBoards)
      t.tex.needsUpdate = true
    }
  }
  const leaderboards = {
    spots: boardTextures.map((t) => ({ x: t.x, z: t.z, stat: t.cfg.stat, title: t.cfg.title })),
    setData(data) {
      boardData = data
      repaintBoards()
    },
  }
  document.fonts?.ready?.then(() => boardData && repaintBoards())

  return {
    treadmills: treads.zones,
    leaderboards,
    shopSlots,
    update(dt, elapsed, focus) {
      for (const sw of swirls) sw.userData.update(dt)
      for (const t of treads.belts) t.offset.y = -elapsed * (TREADMILL.belt / 3) // top of the belt runs toward the low end
      portal.uniforms.uTime.value = elapsed
      for (const l of locks) l.sprite.visible = Math.hypot(focus.x - l.x, focus.z - l.z) < 12
    },
  }
}
void W
