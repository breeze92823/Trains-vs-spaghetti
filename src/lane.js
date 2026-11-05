import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  PlaneGeometry,
  Points,
  RingGeometry,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
} from 'three'
import { COARSE_POINTER, COLORS, HUB, LANE, TREADMILLS } from './config.js'
import { bake } from './bake.js'
import { RAPIER, addDynamic, addFixed, removeBody, unbindMesh, world } from './physics.js'
import { blk, boxGeo, lego, slabGeo } from './lego.js'
import { neon, solidBox } from './propkit.js'
import { sign } from './signs.js'
import { buildTreadmill } from './hubProps.js'
import { player } from './player.js'
import { addWins, earnPower, formatNumber, questEvent, state } from './game.js'
import { mulberry32, paintSoftDot, paintSparkle } from './textures.js'
import * as sfx from './audio/sfx.js'

// The train lane north of the gate (LANE in config): a white studded tunnel
// with a green floor and a track, walls of stacked yellow spaghetti to smash,
// and rooms with a treadmill and a reward pad.
//
// A smash is built to feel good, in layers:
//  - every stick becomes a real Rapier body, flung out from the impact point
//    (harder the more power beats the wall), tumbling, bouncing, clattering on
//    the floor (each hard landing is a sound) and lying around until the train
//    plows through them (player.js lets the train pass through dynamic bodies;
//    the solver shoves them aside)
//  - hit-stop: the world nearly freezes for a beat, then snaps back
//  - a white burst + flash, a shockwave ring on the floor, yellow chips, a dust
//    puff and sparkles, camera shake and an FOV punch
//  - the crunch: thump + snapping sticks + whoosh, pitched up along a combo
//  - "+N" power pops, a combo counter, a screen flash (HUD, via onSmash)
// While racing down the tunnel: speed lines on the camera, white wind arrows
// streaming past the train, a wind bed that rises with speed.

const L = LANE
const HW = L.halfWidth
const OUT = L.outer
const H = L.height
const TOP = HUB.tier2Height
const S = L.stick
const WALL_H = S.layers * S.height
const WALL_D = S.rowsDeep * S.depth
const rnd = (a, b) => a + Math.random() * (b - a)

const rect = (x0, z0, x1, z1) => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
]
function floorPiece(group, x0, z0, x1, z1) {
  const m = new Mesh(slabGeo(rect(x0, z0, x1, z1), 0.3), lego(L.colors.floor, { checker: true }))
  m.position.y = -0.3 // top flush with the floor collider (y = 0): wheels on it, not in it
  m.receiveShadow = true
  group.add(m)
}
// A wall box between x0..x1, z0..z1, full tunnel height, with a collider.
function wallBox(group, mat, x0, x1, z0, z1, h = TOP - 0.1) {
  const w = Math.abs(x1 - x0)
  const d = Math.abs(z1 - z0)
  const cx = (x0 + x1) / 2
  const cz = (z0 + z1) / 2
  blk(group, mat, w, h, d, cx, 0, cz)
  solidBox(w / 2, h / 2, d / 2, cx, h / 2, cz)
}

// --- Wall sign: "LEVEL N" over a green hp pill -------------------------------------------
function wallSign(level) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 256
  let hp = 0
  let max = 0
  const draw = () => {
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, 512, 256)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    ctx.font = '700 92px Fredoka, sans-serif'
    ctx.lineWidth = 14
    ctx.strokeStyle = '#17171f'
    ctx.strokeText(`LEVEL ${level}`, 256, 70)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(`LEVEL ${level}`, 256, 70)
    ctx.fillStyle = '#17171f'
    ctx.beginPath()
    ctx.roundRect(56, 140, 400, 84, 42)
    ctx.fill()
    ctx.fillStyle = '#1d6b1a'
    ctx.beginPath()
    ctx.roundRect(66, 150, 380, 64, 32)
    ctx.fill()
    ctx.fillStyle = '#3fe04a'
    ctx.beginPath()
    ctx.roundRect(66, 150, Math.max(64, 380 * (max ? hp / max : 1)), 64, 32)
    ctx.fill()
    ctx.font = '700 50px Fredoka, sans-serif'
    ctx.lineWidth = 9
    const t = `${formatNumber(hp)} / ${formatNumber(max)}`
    ctx.strokeText(t, 256, 184)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(t, 256, 184)
  }
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  const sprite = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }))
  sprite.center.set(0.5, 0)
  sprite.scale.set(6.4, 3.2, 1)
  sprite.renderOrder = 3
  const set = (h, m) => {
    hp = Math.max(0, h)
    max = m
    draw()
    tex.needsUpdate = true
  }
  document.fonts?.load('700 92px Fredoka').then(() => set(hp, max))
  return { sprite, set }
}

// --- Spaghetti walls ---------------------------------------------------------------------------
// One wall's sticks: layers of sticks end to end (random lengths, ragged ends), rowsDeep rows,
// each layer narrower than the one below. Lengths are rounded so geometries are shared.
const stickGeos = new Map()
function stickGeo(len) {
  let g = stickGeos.get(len)
  if (!g) stickGeos.set(len, (g = boxGeo(len - 0.04, S.height - 0.03, S.depth - 0.05)))
  return g
}
function stickLayout(seed) {
  const rand = mulberry32(seed)
  const out = []
  for (let k = 0; k < S.layers; k++) {
    const width = S.bottom - ((S.bottom - S.top) * k) / (S.layers - 1)
    for (let r = 0; r < S.rowsDeep; r++) {
      let x = -width / 2 - rand() * 0.5
      const end = width / 2 + rand() * 0.5
      while (x < end - 0.6) {
        let len = S.minLen + rand() * (S.maxLen - S.minLen)
        if (end - x - len < S.minLen * 0.6) len = end - x
        len = Math.max(1, Math.round(len * 10) / 10)
        out.push({
          len,
          x: x + len / 2,
          y: k * S.height + S.height / 2,
          dz: (r - (S.rowsDeep - 1) / 2) * S.depth + (rand() - 0.5) * 0.08,
          yaw: (rand() - 0.5) * 0.05,
          color: Math.floor(rand() * S.colors.length),
        })
        x += len + rand() * 0.06
      }
    }
  }
  return out
}

// --- Particles: a CPU-driven pool of soft points (chips, dust, sparkles, wind arrows) -----------
const pointVert = /* glsl */ `
  attribute float size;
  attribute float alpha;
  attribute vec3 tint;
  uniform float uScale;
  varying float vA;
  varying vec3 vC;
  void main() {
    vA = alpha;
    vC = tint;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = size * uScale / max(-mv.z, 0.1);
  }`
const pointFrag = /* glsl */ `
  uniform sampler2D map;
  uniform float uBoost;
  varying float vA;
  varying vec3 vC;
  void main() {
    vec4 t = texture2D(map, gl_PointCoord);
    float a = t.a * vA;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vC * t.rgb * uBoost, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`
function texFrom(c) {
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}
function paintChip() {
  const c = document.createElement('canvas')
  c.width = c.height = 32
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#c99a00'
  ctx.fillRect(4, 4, 24, 24)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(7, 7, 18, 18)
  return c
}
function paintArrow() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')
  ctx.translate(32, 32)
  ctx.rotate(0.5)
  ctx.beginPath()
  ctx.moveTo(-8, -26)
  ctx.lineTo(8, -26)
  ctx.lineTo(8, 4)
  ctx.lineTo(18, 4)
  ctx.lineTo(0, 26)
  ctx.lineTo(-18, 4)
  ctx.lineTo(-8, 4)
  ctx.closePath()
  ctx.lineJoin = 'round'
  ctx.lineWidth = 5
  ctx.strokeStyle = 'rgba(150,170,200,0.9)'
  ctx.stroke()
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  return c
}
function particlePool(scene, { count, map, additive = false, bounce = false, boost = 1 }) {
  const pos = new Float32Array(count * 3)
  const tint = new Float32Array(count * 3)
  const size = new Float32Array(count)
  const alpha = new Float32Array(count)
  const vel = new Float32Array(count * 3)
  const life = new Float32Array(count)
  const max = new Float32Array(count)
  const base = new Float32Array(count)
  const grow = new Float32Array(count)
  const grav = new Float32Array(count)
  const drag = new Float32Array(count)
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(pos, 3))
  geo.setAttribute('tint', new BufferAttribute(tint, 3))
  geo.setAttribute('size', new BufferAttribute(size, 1))
  geo.setAttribute('alpha', new BufferAttribute(alpha, 1))
  const mat = new ShaderMaterial({
    uniforms: { map: { value: map }, uScale: { value: 400 }, uBoost: { value: boost } },
    vertexShader: pointVert,
    fragmentShader: pointFrag,
    transparent: true,
    depthWrite: false,
    blending: additive ? AdditiveBlending : NormalBlending,
  })
  const points = new Points(geo, mat)
  points.frustumCulled = false
  points.renderOrder = 5
  scene.add(points)
  let cursor = 0
  let live = 0
  const tmp = { r: 0, g: 0, b: 0 }
  const hex = (c) => {
    const n = parseInt(c.slice(1), 16)
    tmp.r = ((n >> 16) & 255) / 255
    tmp.g = ((n >> 8) & 255) / 255
    tmp.b = (n & 255) / 255
    return tmp
  }
  return {
    // o: { x, y, z, n, spread [x,y,z], vel [x,y,z], jitter, life, size, grow, gravity, drag, colors[] }
    emit(o) {
      for (let k = 0; k < o.n; k++) {
        const i = cursor
        cursor = (cursor + 1) % count
        const sp = o.spread ?? [0, 0, 0]
        pos[i * 3] = o.x + (Math.random() * 2 - 1) * sp[0]
        pos[i * 3 + 1] = o.y + (Math.random() * 2 - 1) * sp[1]
        pos[i * 3 + 2] = o.z + (Math.random() * 2 - 1) * sp[2]
        const v = o.vel ?? [0, 0, 0]
        const j = o.jitter ?? 0
        vel[i * 3] = v[0] + (Math.random() * 2 - 1) * j
        vel[i * 3 + 1] = v[1] + (Math.random() * 2 - 1) * j * 0.7
        vel[i * 3 + 2] = v[2] + (Math.random() * 2 - 1) * j
        max[i] = life[i] = o.life * rnd(0.7, 1.25)
        base[i] = o.size * rnd(0.6, 1.3)
        grow[i] = o.grow ?? 1
        grav[i] = o.gravity ?? 0
        drag[i] = o.drag ?? 0
        const c = hex(o.colors[Math.floor(Math.random() * o.colors.length)])
        tint[i * 3] = c.r
        tint[i * 3 + 1] = c.g
        tint[i * 3 + 2] = c.b
      }
      live = count
    },
    update(dt, scale) {
      mat.uniforms.uScale.value = scale
      if (!live) return
      let alive = 0
      for (let i = 0; i < count; i++) {
        if (life[i] <= 0) {
          alpha[i] = 0
          continue
        }
        alive++
        life[i] -= dt
        const k = 1 - Math.max(0, life[i]) / max[i]
        vel[i * 3 + 1] -= grav[i] * dt
        const d = Math.max(0, 1 - drag[i] * dt)
        vel[i * 3] *= d
        vel[i * 3 + 1] *= d
        vel[i * 3 + 2] *= d
        pos[i * 3] += vel[i * 3] * dt
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt
        if (bounce && pos[i * 3 + 1] < 0.08) {
          pos[i * 3 + 1] = 0.08
          vel[i * 3 + 1] = Math.abs(vel[i * 3 + 1]) * 0.35
          vel[i * 3] *= 0.6
          vel[i * 3 + 2] *= 0.6
        }
        size[i] = base[i] * (1 + (grow[i] - 1) * k)
        alpha[i] = Math.min(1, k * 8) * (1 - Math.max(0, (k - 0.6) / 0.4))
      }
      if (!alive) live = 0
      geo.attributes.position.needsUpdate = true
      geo.attributes.size.needsUpdate = true
      geo.attributes.alpha.needsUpdate = true
      geo.attributes.tint.needsUpdate = true
    },
  }
}

// --- Speed lines: thin white streaks streaming past the camera -------------------------------
function speedLines(camera) {
  const c = document.createElement('canvas')
  c.width = 4
  c.height = 128
  const ctx = c.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 0, 128)
  g.addColorStop(0, 'rgba(255,255,255,0)')
  g.addColorStop(0.5, 'rgba(255,255,255,1)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 4, 128)
  const mat = new MeshBasicMaterial({ color: '#ffffff', alphaMap: new CanvasTexture(c), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, depthTest: false, side: DoubleSide })
  const group = new Group()
  camera.add(group)
  const lines = []
  for (let i = 0; i < 44; i++) {
    const geo = new PlaneGeometry(0.035 + Math.random() * 0.04, 3 + Math.random() * 5)
    geo.rotateX(Math.PI / 2)
    const m = new Mesh(geo, mat)
    const a = Math.random() * Math.PI * 2
    const r = 1.6 + Math.random() * 3.2
    m.position.set(Math.cos(a) * r * 1.5, Math.sin(a) * r, -2 - Math.random() * 38)
    m.rotation.z = a + Math.PI / 2
    m.renderOrder = 20
    m.frustumCulled = false
    group.add(m)
    lines.push(m)
  }
  let level = 0
  return {
    get level() {
      return level
    },
    update(dt, target, speed) {
      level += (target - level) * (1 - Math.exp(-6 * dt))
      mat.opacity = level * 0.42
      group.visible = level > 0.01
      if (!group.visible) return
      for (const m of lines) {
        m.position.z += speed * 2.2 * dt
        if (m.position.z > 1) m.position.z -= 40
      }
    },
  }
}

// --- Smash burst: white spikes and a flash at the impact point; shockwave rings on the floor ----
function burst(scene) {
  const group = new Group()
  group.visible = false
  const spikeMat = neon('#ffffff', 3, { transparent: true, opacity: 1, blending: AdditiveBlending, depthWrite: false, side: DoubleSide })
  for (let i = 0; i < 18; i++) {
    const geo = new PlaneGeometry(0.28, 1)
    geo.translate(0, 0.5, 0)
    const m = new Mesh(geo, spikeMat)
    m.rotation.z = (i / 18) * Math.PI * 2 + Math.random() * 0.3
    m.scale.y = 3 + Math.random() * 5
    m.renderOrder = 6
    group.add(m)
  }
  const flash = new Sprite(new SpriteMaterial({ map: texFrom(paintSoftDot(128)), color: '#fff6c8', transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false }))
  flash.renderOrder = 7
  group.add(flash)
  scene.add(group)
  const rings = []
  for (let i = 0; i < 4; i++) {
    const mat = neon('#fff8d8', 2.4, { transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide })
    const ring = new Mesh(new RingGeometry(0.85, 1, 48), mat)
    ring.rotation.x = -Math.PI / 2
    ring.visible = false
    ring.renderOrder = 5
    scene.add(ring)
    rings.push({ ring, t: 1, size: 1 })
  }
  let nextRing = 0
  let t = 1
  let size = 1
  return {
    fire(x, y, z, scale = 1) {
      size = scale
      group.position.set(x, y, z)
      group.rotation.z = Math.random() * Math.PI
      t = 0
      group.visible = true
      const r = rings[nextRing]
      nextRing = (nextRing + 1) % rings.length
      r.ring.position.set(x, 0.12, z)
      r.t = 0
      r.size = scale
      r.ring.visible = true
    },
    update(dt) {
      for (const r of rings) {
        if (!r.ring.visible) continue
        r.t += dt / 0.55
        if (r.t >= 1) {
          r.ring.visible = false
          continue
        }
        const s = (1 + r.t * 13) * r.size
        r.ring.scale.set(s, s, s)
        r.ring.material.opacity = (1 - r.t) * (1 - r.t)
      }
      if (!group.visible) return
      t += dt / 0.32
      if (t >= 1) {
        group.visible = false
        return
      }
      const s = (0.35 + t * 1.3) * Math.min(size, 1.15)
      group.scale.set(s, s, s)
      spikeMat.opacity = (1 - t) * 0.8
      flash.material.opacity = (1 - t) * (1 - t) * 0.55
      flash.scale.setScalar(2.5 + t * 4)
    },
  }
}

export function buildLane(scene, camera, { onSmash, onHold, onReward, onEnter } = {}) {
  const statics = new Group() // tunnel, rooms, track: no shadows cast (it would black out the tunnel)
  const shadowed = new Group() // props inside that do cast
  const live = new Group()
  scene.add(live)
  // A little self-light keeps the shaded side of the tunnel as pale as the reference.
  const wallMat = lego(L.colors.wall, { emissive: '#aebbd0', emissiveIntensity: 0.32 })
  const blockMat = lego(L.colors.block, { emissive: '#7f9cc4', emissiveIntensity: 0.3 })

  // --- Corridors and rooms -------------------------------------------------------------------
  // Corridor spans between rooms (z runs negative going north).
  const spans = []
  let z = L.start
  for (const room of L.rooms) {
    spans.push([z, room.z0])
    z = room.z1 - L.passage
  }
  spans.push([z, L.end])
  for (const [za, zb] of spans) {
    floorPiece(statics, -HW, zb, HW, za)
    wallBox(statics, wallMat, -OUT, -HW, za, zb)
    wallBox(statics, wallMat, HW, OUT, za, zb)
    blk(statics, wallMat, OUT * 2, TOP - H - 0.1, Math.abs(za - zb), 0, H, (za + zb) / 2) // ceiling (just under the far grass)
  }
  const zones = []
  const rewards = []
  // Reward pad: yellow base, black frame, red plate, with its "xN REWARD +N Wins" sign.
  function rewardPad(px, zc, reward, k = 1) {
    blk(shadowed, lego(COLORS.yellow), 11 * k, 0.18, 13 * k, px, 0, zc)
    blk(shadowed, lego('#1b1b22'), 9.4 * k, 0.3, 11.4 * k, px, 0.1, zc)
    blk(shadowed, lego('#ff2424'), 8.6 * k, 0.34, 10.6 * k, px, 0.12, zc)
    const label = sign(
      [
        { text: `x${reward.mult} REWARD`, color: '#ffffff', size: 0.9 },
        { text: `+${formatNumber(reward.wins)} Wins`, icon: 'trophy', color: ['#ff7a7a', '#ff1f3a'], size: 1.05 },
      ],
      1.6,
    )
    label.position.set(px, 2.4 * Math.max(k, 0.75), zc - 1)
    live.add(label)
    return { x0: px - 4.3 * k, x1: px + 4.3 * k, z0: zc - 5.3 * k, z1: zc + 5.3 * k, x: px, z: zc, label, claimed: false }
  }
  L.rooms.forEach((room, i) => {
    const rw = room.halfWidth
    const zc = (room.z0 + room.z1) / 2
    floorPiece(statics, -rw, room.z1 - L.passage, rw, room.z0)
    wallBox(statics, wallMat, -rw - 3, -rw, room.z0, room.z1 - L.passage)
    wallBox(statics, wallMat, rw, rw + 3, room.z0, room.z1 - L.passage)
    for (const s of [-1, 1]) {
      wallBox(statics, wallMat, s * HW, s * (rw + 3), room.z0 + 2, room.z0) // south end, either side of the tunnel mouth
      wallBox(statics, blockMat, s * HW, s * rw, room.z1, room.z1 - L.passage, H) // blue blocks narrowing to the passage
    }
    blk(statics, wallMat, (rw + 3) * 2, TOP - H - 0.1, Math.abs(room.z0 - room.z1) + L.passage, 0, H, (room.z0 + room.z1 - L.passage) / 2)
    // Treadmill on the west side, its headboard against the wall.
    const t = buildTreadmill(scene, shadowed, live, TREADMILLS[room.treadmill], { cx: -rw + 7.5, cz: zc, dir: -1, index: 50 + i })
    zones.push(t.zone)
    // Reward pad on the east side.
    rewards.push({ tex: t.tex, reward: room.reward, pad: rewardPad(rw - 8, zc, room.reward) })
  })
  wallBox(statics, wallMat, -OUT, OUT, L.end, L.end - 3) // the closing wall

  // Track down the middle, full length.
  const sleeper = lego(COLORS.sleeper)
  const rail = lego(COLORS.rail, { rough: 0.4 })
  // Rails at the trains' wheel gauge, topping out at track.railTop (the train is lifted onto them, trackLift).
  const RT = L.track
  for (let tz = L.start - 0.6; tz > L.end + 0.6; tz -= 1.15) blk(statics, sleeper, RT.sleeperWidth, RT.railTop - 0.22, 0.5, 0, 0, tz)
  for (const x of [-RT.halfGauge, RT.halfGauge]) blk(statics, rail, 0.22, 0.22, Math.abs(L.end - L.start), x, RT.railTop - 0.22, (L.start + L.end) / 2)
  addFixed(RAPIER.ColliderDesc.cuboid(30, 1, (L.start - L.end) / 2 + 4), { x: 0, y: -1, z: (L.start + L.end) / 2 }, null, { friction: 0.9 })

  for (const [g, cast] of [
    [statics, false],
    [shadowed, true],
  ]) {
    const baked = bake(g, cast)
    baked.traverse((o) => {
      if (o.isMesh) o.receiveShadow = true
    })
    scene.add(baked)
  }

  // --- Spaghetti walls ----------------------------------------------------------------------------
  const stickMats = S.colors.map((c) => lego(c, { emissive: '#7a5a00', emissiveIntensity: 0.22, rough: 0.55 }))
  const wallCollider = (zc) => addFixed(RAPIER.ColliderDesc.cuboid(HW, WALL_H / 2 + 0.4, WALL_D / 2), { x: 0, y: WALL_H / 2 + 0.4, z: zc })
  const walls = L.walls.map((cfg, i) => {
    const layout = stickLayout(1000 + i * 77)
    const g = new Group()
    for (const st of layout) {
      const m = new Mesh(stickGeo(st.len), stickMats[st.color])
      m.position.set(st.x, st.y, cfg.z + st.dz)
      m.rotation.y = st.yaw
      g.add(m)
    }
    const mesh = bake(g, true)
    mesh.traverse((o) => {
      if (o.isMesh) o.receiveShadow = true
    })
    scene.add(mesh)
    const s = wallSign(i + 1)
    s.sprite.position.set(0, WALL_H + 0.3, cfg.z)
    live.add(s.sprite)
    s.set(cfg.hp, cfg.hp)
    return { ...cfg, level: i + 1, layout, mesh, sign: s, hpNow: cfg.hp, alive: true, collider: wallCollider(cfg.z), cooldown: 0, jiggle: 0 }
  })

  // --- Effects ------------------------------------------------------------------------------------
  const lines = speedLines(camera)
  const fx = burst(scene)
  const chips = particlePool(scene, { count: 500, map: texFrom(paintChip()), bounce: true })
  const dust = particlePool(scene, { count: 220, map: texFrom(paintSoftDot(64)) })
  const sparks = particlePool(scene, { count: 260, map: texFrom(paintSparkle(64)), additive: true, boost: 2.4 })
  const arrows = particlePool(scene, { count: 160, map: texFrom(paintArrow()) })
  const debris = [] // { body, mesh, life, vy, pan }
  let shake = 0
  let hitStop = 0
  let fovKick = 0
  let anyBroken = false
  let combo = 0
  let lastSmash = -99
  let clock = 0
  let wasInside = false
  let runSpeed = 0 // smoothed speed down the lane while it drives itself
  let stall = 0
  let lastZ = 0
  let held = false // a wall held / the train stalled: no auto-run again until a key is pressed
  let arrowAcc = 0
  let pointScale = 400

  function clearDebris(all) {
    for (let i = debris.length - 1; i >= 0; i--) {
      if (!all && debris[i].life > 0) continue
      const d = debris[i]
      unbindMesh(d.mesh)
      removeBody(d.body)
      scene.remove(d.mesh)
      debris.splice(i, 1)
    }
  }

  function smash(w) {
    w.alive = false
    w.mesh.visible = false
    w.sign.sprite.visible = false
    world.removeCollider(w.collider, true)
    w.collider = null
    anyBroken = true
    combo = clock - lastSmash < L.comboWindow ? combo + 1 : 1
    lastSmash = clock
    // How hard: how far the train's power beats the wall, plus its speed.
    const ratio = state.power / Math.max(1, w.hp)
    const speed = Math.hypot(player.velocity.x, player.velocity.z)
    const big = Math.min(2, 0.8 + 0.5 * Math.log10(ratio + 1) + speed / 40)
    const hx = player.position.x
    const hy = 1.6
    const face = w.z + WALL_D / 2
    const D = L.debris
    // Too many sticks lying around: the oldest start fading now.
    const over = debris.length + w.layout.length - D.max
    for (let i = 0; i < over && i < debris.length; i++) debris[i].life = Math.min(debris[i].life, 0.5)
    for (const st of w.layout) {
      const m = new Mesh(stickGeo(st.len), stickMats[st.color])
      m.position.set(st.x, st.y, w.z + st.dz)
      m.rotation.y = st.yaw
      m.castShadow = true
      scene.add(m)
      const body = addDynamic(m, RAPIER.ColliderDesc.cuboid((st.len - 0.04) / 2, (S.height - 0.03) / 2, (S.depth - 0.05) / 2), {
        density: D.density,
        friction: D.friction,
        restitution: D.restitution,
        linearDamping: 0.12,
        angularDamping: 0.35,
        ccd: true,
      })
      const dx = st.x - hx
      const dy = st.y - hy
      const dist = Math.hypot(dx, dy)
      const near = 1 / (1 + dist * 0.22)
      const push = D.push * big * (0.55 + 0.9 * near)
      body.setLinvel(
        {
          x: (dx / (dist + 0.5)) * push * 0.75 + rnd(-2, 2),
          y: 2 + rnd(0, 7) * near * big + Math.max(0, dy) * 0.9,
          z: -push * rnd(0.6, 1.25) - speed * 0.4,
        },
        true,
      )
      const sp = D.spin * big
      body.setAngvel({ x: rnd(-0.5, 0.5) * sp, y: rnd(-1, 1) * sp, z: rnd(-0.7, 0.7) * sp }, true)
      debris.push({ body, mesh: m, life: D.life * rnd(0.85, 1.15), vy: 0, pan: Math.max(-1, Math.min(1, st.x / HW)) })
    }
    // Particles: yellow chips flying, dust rolling out low, sparkles at the heart.
    chips.emit({ x: hx, y: hy, z: face, n: Math.round(70 * big), spread: [2.5, 1.4, 0.4], vel: [0, 5, -8 * big], jitter: 9 * big, life: 1.3, size: 0.32, gravity: 24, drag: 0.4, colors: S.colors })
    dust.emit({ x: 0, y: 0.5, z: face, n: 16, spread: [HW - 1, 0.3, 0.6], vel: [0, 1, -2], jitter: 3, life: 1.2, size: 1.5, grow: 2.4, drag: 1.8, colors: ['#fff6d8', '#ffffff', '#ffe9a8'] })
    sparks.emit({ x: hx, y: hy, z: face, n: Math.round(40 * big), spread: [1.2, 1, 0.3], vel: [0, 2, -4], jitter: 12, life: 0.6, size: 0.6, drag: 2.5, colors: ['#ffffff', '#fff3a0', '#ffd84a'] })
    fx.fire(hx, hy, face + 0.4, big)
    shake = 0.45 + 0.25 * big
    hitStop = L.hitStop.duration * (0.7 + 0.4 * Math.min(1.5, big))
    fovKick = L.fovKick * Math.min(1.4, big)
    const amount = earnPower(L.smashPower * Math.min(combo, 10))
    questEvent('wall')
    sfx.smash({ big, combo })
    // A short buzz on phones (only after a real tap: browsers refuse it before one).
    if (COARSE_POINTER && navigator.userActivation?.hasBeenActive) {
      try {
        navigator.vibrate?.(Math.round(20 + 20 * big))
      } catch {
        // No vibration here.
      }
    }
    onSmash?.(amount, w, combo, big)
  }

  function rebuild() {
    for (const w of walls) {
      w.hpNow = w.hp
      w.sign.set(w.hp, w.hp)
      if (w.alive) continue
      w.alive = true
      w.mesh.visible = true
      w.sign.sprite.visible = true
      w.collider = wallCollider(w.z)
    }
    for (const r of rewards) {
      r.pad.claimed = false
      r.pad.label.material.opacity = 1
    }
    clearDebris(true)
    anyBroken = false
    combo = 0
    lastSmash = -99
  }

  // Inside the tunnel or one of its rooms.
  const contains = (p) => {
    if (p.z > L.start) return false
    const room = L.rooms.find((r) => p.z <= r.z0 && p.z >= r.z1 - L.passage)
    return Math.abs(p.x) <= (room ? room.halfWidth : HW) + 0.5
  }

  // Full steam ahead: onto the track (x = 0) and north along it until something stops it.
  const startRun = (p) => {
    player.autoRun = { x: 0, z: -1, px: 0, pz: 0 }
    runSpeed = 0
    stall = -L.autoRun.grace
    lastZ = p.z
  }
  const T = L.track
  const smooth = (e0, e1, v) => {
    const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)
  }

  return {
    treadmills: zones,
    contains,
    // Height of the track's rails under a train at (x, z): it rides on them, not between them.
    trackLift(x, z) {
      if (z > L.start - 0.3 || z < L.end + 0.3) return 0
      return T.railTop * (1 - smooth(T.lift[0], T.lift[1], Math.abs(x)))
    },
    // Scales the frame's dt for the hit-stop freeze after a smash (call once a frame with the real dt).
    timeScale(realDt) {
      if (hitStop <= 0) return 1
      hitStop -= realDt
      return L.hitStop.scale
    },
    // Point sprites are sized in metres: they need the drawing-buffer height.
    setViewport(heightPx) {
      pointScale = heightPx * 0.5 * camera.projectionMatrix.elements[5]
    },
    get combo() {
      return clock - lastSmash < L.comboWindow ? combo : 0
    },
    update(dt, elapsed) {
      clock += dt
      const p = player.position
      const inside = contains(p)
      if (inside && !wasInside) {
        questEvent('run') // a run starts each time the train enters the lane
        sfx.whistle()
        onEnter?.()
        held = false
        startRun(p)
      }
      wasInside = inside
      player.speedScale = inside ? L.speedScale : 1
      const A = L.autoRun
      if (!inside || player.training) player.autoRun = null
      else if (player.autoRun) {
        if (dt > 0) {
          // Blocked (the closing wall, a block corner): the run is over.
          runSpeed += ((lastZ - p.z) / dt - runSpeed) * (1 - Math.exp(-10 * dt))
          stall = runSpeed < A.stallSpeed ? stall + dt : Math.min(stall + dt, 0) // grace runs out either way
          if (stall > A.stallTime) {
            player.autoRun = null
            held = true
          }
        }
      } else {
        // Driving by hand: letting go (or heading up the track) near the track steps back onto it.
        const w = player.wish
        const mag = Math.hypot(w.x, w.z)
        if (mag > A.release) held = false
        if (!held && Math.abs(p.x) < A.snap && (mag <= A.release || -w.z > mag * 0.85)) startRun(p)
      }
      lastZ = p.z
      if (!inside && p.z > L.start + 12 && anyBroken) rebuild()
      for (const r of rewards) if (r.tex) r.tex.offset.y = -elapsed * 0.55

      if (inside) {
        // Walls: smash the first standing one the nose reaches; a strong one holds and pushes back.
        for (const w of walls) {
          w.cooldown = Math.max(0, w.cooldown - dt)
          if (!w.alive) continue
          const face = w.z + WALL_D / 2
          const gap = p.z - face
          if (gap < -1 || gap > 2.6 || Math.abs(p.x) > HW) continue
          if (state.power >= w.hpNow) smash(w)
          else if (w.cooldown <= 0) {
            w.cooldown = L.ramCooldown
            w.hpNow -= state.power
            if (w.hpNow <= 0) smash(w)
            else {
              w.sign.set(w.hpNow, w.hp)
              player.velocity.z = L.knockback
              player.autoRun = null // the wall holds: the train stops here
              held = true
              player.velocity.x *= 0.3
              shake = 0.32
              w.jiggle = 1
              fx.fire(p.x, 1.8, face + 0.2, 0.45)
              chips.emit({ x: p.x, y: 1.6, z: face + 0.3, n: 18, spread: [1, 0.8, 0.2], vel: [0, 4, 3], jitter: 5, life: 0.9, size: 0.26, gravity: 24, colors: S.colors })
              sfx.hold()
              onHold?.(w)
            }
          }
          break
        }
        // Reward pads: once per run.
        for (const r of rewards) {
          const pad = r.pad
          if (pad.claimed || p.x < pad.x0 || p.x > pad.x1 || p.z < pad.z0 || p.z > pad.z1) continue
          pad.claimed = true
          pad.label.material.opacity = 0.35
          questEvent('reward', 1, true)
          addWins(r.reward.wins)
          sparks.emit({ x: pad.x, y: 0.6, z: pad.z, n: 80, spread: [4, 0.2, 5], vel: [0, 7, 0], jitter: 3, life: 1.2, size: 0.7, gravity: 5, colors: ['#ffd84a', '#ffffff', '#ff5a6a'] })
          sfx.reward()
          onReward?.(r.reward)
        }
      }

      // A wall that held wobbles back into place.
      for (const w of walls) {
        if (w.jiggle <= 0) continue
        w.jiggle = Math.max(0, w.jiggle - dt * 3)
        w.mesh.position.z = Math.sin(clock * 55) * 0.18 * w.jiggle
        w.mesh.position.x = Math.sin(clock * 37) * 0.06 * w.jiggle
      }

      // Debris: a clatter on each hard landing, a fade at the end of its life.
      for (const d of debris) {
        d.life -= dt
        const v = d.body.linvel()
        if (d.vy < -3.5 && v.y > d.vy + 3) sfx.clatter(-d.vy / 12, d.pan)
        d.vy = v.y
        if (d.life < 0.5) d.mesh.scale.setScalar(Math.max(0.01, d.life / 0.5))
      }
      clearDebris(false)

      // Wind arrows streaming past the train while it races.
      const speed = Math.hypot(player.velocity.x, player.velocity.z)
      const racing = inside && speed > 9 ? Math.min(1, (speed - 9) / 8) : 0
      arrowAcc += dt * 46 * racing
      while (arrowAcc >= 1) {
        arrowAcc -= 1
        const side = Math.random() < 0.5 ? -1 : 1
        arrows.emit({ x: p.x + side * rnd(0.9, 3.2), y: rnd(0.4, 3), z: p.z - rnd(1, 7), n: 1, vel: [side * rnd(0.5, 2), rnd(-1, 0.5), rnd(18, 30)], life: 0.38, size: rnd(0.5, 0.9), colors: ['#ffffff', '#eef4ff'] })
      }
      lines.update(dt, racing, speed)
      sfx.setWind(Math.max(racing, lines.level * 0.8))
      chips.update(dt, pointScale)
      dust.update(dt, pointScale)
      sparks.update(dt, pointScale)
      arrows.update(dt, pointScale)
      fx.update(dt)
      fovKick *= Math.exp(-7 * dt)
    },
    // After the camera has placed itself: the smash shake and FOV punch.
    shakeCamera(cam, dt) {
      if (fovKick > 0.05) {
        cam.fov += fovKick
        cam.updateProjectionMatrix()
      }
      if (shake <= 0) return
      const a = shake * shake * 0.6
      cam.position.x += (Math.random() - 0.5) * a
      cam.position.y += (Math.random() - 0.5) * a
      cam.position.z += (Math.random() - 0.5) * a
      shake = Math.max(0, shake - dt * 1.8)
    },
  }
}
