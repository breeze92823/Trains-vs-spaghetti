import { CylinderGeometry, Group, Mesh, SphereGeometry } from 'three'
import { RAILCAR_TYPES, RAILCARS } from './config.js'
import { cbox, plastic } from './lego.js'
import { lookColor } from './ui/railcarArt.js'

// Railcars behind the player's train (the reference: a blue open gondola hooked on
// behind the engine). Models face +Z with their wheels on y = 0, like trains.js.
// They follow the engine's path: the engine's positions are recorded as a trail and
// each wagon sits with its front and rear couplings on that trail, so the train
// snakes round corners and pitches over ramps. Backing up eats the trail again.
const DARK = '#1c1c21'
const STEEL = '#9a9aa2'
const ENGINE_REAR = 1.9 // m from the engine's centre to its rear coupling
const STEP = 0.12 // m between trail points

const cyl = new Map()
function cylGeo(r, h, seg = 16) {
  const k = `${r}|${h}|${seg}`
  if (!cyl.has(k)) cyl.set(k, new CylinderGeometry(r, r, h, seg))
  return cyl.get(k)
}

function wheels(g, len) {
  const wheel = plastic(DARK, { rough: 0.5 })
  const rim = plastic(STEEL, { metal: 0.4, rough: 0.35 })
  for (const zc of [len / 2 - 1, -len / 2 + 1]) {
    cbox(g, plastic(DARK), 1.2, 0.26, 1.4, 0, 0.3, zc)
    for (const dz of [-0.42, 0.42]) {
      for (const s of [-1, 1]) {
        const w = new Mesh(cylGeo(0.3, 0.14), wheel)
        w.position.set(s * 0.66, 0.3, zc + dz)
        w.rotation.z = Math.PI / 2
        w.castShadow = true
        const hub = new Mesh(cylGeo(0.12, 0.16, 8), rim)
        w.add(hub)
        g.add(w)
        g.userData.wheels.push(w)
      }
    }
  }
  // Underframe + couplers.
  cbox(g, plastic(DARK), 1.45, 0.22, len - 0.2, 0, 0.6, 0)
  for (const s of [-1, 1]) cbox(g, plastic('#3a3a42'), 0.22, 0.18, 0.35, 0, 0.62, s * (len / 2 + 0.05))
}

function gondola(g, t, len) {
  const body = plastic(t.color)
  const rib = plastic(shade(t.color, 0.7))
  const w = 1.78
  const h = 1.15
  const y = 0.82
  cbox(g, body, w, 0.16, len, 0, y, 0) // floor
  for (const s of [-1, 1]) {
    cbox(g, body, 0.12, h, len, s * (w / 2 - 0.06), y, 0)
    cbox(g, body, w, h, 0.12, 0, y, s * (len / 2 - 0.06))
    // Ribs down the outside, and a rim.
    for (let z = -len / 2 + 0.45; z <= len / 2 - 0.4; z += 0.62) cbox(g, rib, 0.08, h, 0.14, s * (w / 2 + 0.02), y, z)
    cbox(g, plastic(shade(t.color, 1.15)), 0.18, 0.1, len + 0.04, s * (w / 2 - 0.04), y + h, 0)
  }
}

function container(g, t, len) {
  const c = lookColor(t.look)
  cbox(g, plastic('#2a2a32'), 1.8, 0.16, len, 0, 0.72, 0) // flat deck
  const bl = len - 0.4
  const box = cbox(g, plastic(c.base), 1.7, 1.7, bl, 0, 0.88, 0)
  box.userData.look = t.look
  const rib = plastic(c.dark)
  for (const s of [-1, 1]) {
    for (let z = -bl / 2 + 0.25; z <= bl / 2 - 0.2; z += 0.3) cbox(g, rib, 0.06, 1.55, 0.08, s * 0.86, 0.95, z)
    // Doors at the back, frame posts at the corners.
    for (const x of [-0.5, -0.2, 0.2, 0.5]) cbox(g, plastic('#e8e8ee'), 0.06, 1.5, 0.06, x, 0.98, -bl / 2 - 0.02)
    for (const z of [-bl / 2, bl / 2]) cbox(g, plastic('#26262e'), 0.14, 1.74, 0.14, s * 0.83, 0.86, z)
  }
  cbox(g, plastic(c.light), 1.6, 0.06, bl - 0.1, 0, 2.58, 0) // roof
  // The look's mark on both sides.
  const mark = { automotive: '#ff2a3a', recycling: '#ffffff', desert: '#ffd06a', cosmic: '#ff7af0', food: '#ffd23a', industrial: '#ffb070' }[t.look]
  if (mark) for (const s of [-1, 1]) cbox(g, plastic(mark, { emissive: t.look === 'cosmic' ? mark : null, emissiveIntensity: 0.6 }), 0.04, 0.5, bl * 0.5, s * 0.89, 1.5, 0)
}

function coach(g, t, len) {
  const body = plastic(t.color)
  cbox(g, body, 1.8, 1.6, len, 0, 0.75, 0)
  const roof = new Mesh(cylGeo(0.95, len, 20), plastic(shade(t.color, 0.6)))
  roof.rotation.x = Math.PI / 2
  roof.scale.set(1, 1, 0.3)
  roof.position.set(0, 2.33, 0)
  roof.castShadow = true
  g.add(roof)
  const glass = plastic('#14141a', { rough: 0.15 })
  const stripe = plastic(t.stripe ?? '#ffffff')
  for (const s of [-1, 1]) {
    cbox(g, glass, 0.04, 0.45, len - 0.8, s * 0.91, 1.62, 0)
    cbox(g, stripe, 0.04, 0.16, len, s * 0.91, 1.22, 0)
  }
}

function tanker(g, t, len) {
  cbox(g, plastic('#2a2a32'), 1.6, 0.14, len, 0, 0.72, 0)
  const mat = plastic(t.color, { rough: 0.3, metal: 0.3 })
  const tube = new Mesh(cylGeo(0.82, len - 1.1, 22), mat)
  tube.rotation.x = Math.PI / 2
  tube.position.set(0, 1.7, 0)
  tube.castShadow = true
  g.add(tube)
  for (const s of [-1, 1]) {
    const cap = new Mesh(new SphereGeometry(0.82, 18, 10), mat)
    cap.scale.set(1, 1, 0.55)
    cap.position.set(0, 1.7, s * (len / 2 - 0.55))
    cap.castShadow = true
    g.add(cap)
  }
  cbox(g, plastic('#3a3a42'), 0.5, 0.25, 0.5, 0, 2.5, 0) // dome
  cbox(g, plastic(DARK), 1.9, 0.08, 0.5, 0, 0.9, 0) // saddle
}

function hopper(g, t, len) {
  const body = plastic(t.color)
  cbox(g, body, 1.8, 1.25, len - 0.3, 0, 1.25, 0)
  for (const s of [-1, 1]) {
    const slope = cbox(g, body, 1.6, 0.9, 1.2, 0, 0.62, s * (len / 2 - 1.1))
    slope.rotation.x = s * 0.5
  }
  cbox(g, plastic(shade(t.color, 0.7)), 1.6, 0.6, 0.9, 0, 0.6, 0)
  for (let z = -len / 2 + 0.6; z <= len / 2 - 0.5; z += 0.7) for (const s of [-1, 1]) cbox(g, plastic(shade(t.color, 0.75)), 0.06, 1.25, 0.12, s * 0.91, 1.25, z)
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16)
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)))
  return `#${[n >> 16, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('')}`
}

const KINDS = { gondola: [gondola, 5.2], container: [container, 5.4], coach: [coach, 5.6], tanker: [tanker, 5.0], hopper: [hopper, 4.8] }

export function buildWagon(typeId) {
  const t = RAILCAR_TYPES[typeId]
  const [build, len] = KINDS[t.kind] ?? KINDS.gondola
  const g = new Group()
  g.userData.wheels = []
  g.userData.length = len
  g.userData.type = typeId
  wheels(g, len)
  build(g, t, len)
  g.rotation.order = 'YXZ'
  return g
}

export function createWagons(scene) {
  const root = new Group()
  scene.add(root)
  let cars = [] // { mesh, len, last, lx, lz (previous centre, for the wheel spin) }
  let shownKey = ''
  // The trail: [x, y, z] newest first; trail[0] is the engine's centre right now.
  let trail = []

  function seed(x, y, z, facing) {
    trail = []
    const need = ENGINE_REAR + cars.reduce((s, c) => s + c.len + RAILCARS.gap, 0) + 2
    const dx = -Math.sin(facing)
    const dz = -Math.cos(facing)
    for (let d = 0; d <= need; d += STEP) trail.push([x + dx * d, y, z + dz * d])
  }

  // Point `dist` m back along the trail (extrapolated past its end).
  const tmp = [0, 0, 0]
  function along(dist) {
    let acc = 0
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1]
      const b = trail[i]
      const seg = Math.hypot(b[0] - a[0], b[2] - a[2])
      if (acc + seg >= dist && seg > 1e-6) {
        const k = (dist - acc) / seg
        tmp[0] = a[0] + (b[0] - a[0]) * k
        tmp[1] = a[1] + (b[1] - a[1]) * k
        tmp[2] = a[2] + (b[2] - a[2]) * k
        return tmp
      }
      acc += seg
    }
    const e = trail[trail.length - 1]
    tmp[0] = e[0]
    tmp[1] = e[1]
    tmp[2] = e[2]
    return tmp
  }

  return {
    root,
    // types: RAILCAR_TYPES ids, engine-side first.
    set(types, x, y, z, facing) {
      const key = types.join(',')
      if (key === shownKey) return
      shownKey = key
      for (const c of cars) root.remove(c.mesh)
      cars = types.map((id) => {
        const mesh = buildWagon(id)
        root.add(mesh)
        return { mesh, len: mesh.userData.length, last: false, lx: 0, lz: 0 }
      })
      seed(x, y, z, facing)
    },
    reset: (x, y, z, facing) => seed(x, y, z, facing),
    // rear: m from the engine's centre to its rear coupling (half the equipped train's length).
    update(x, y, z, facing, rear = ENGINE_REAR) {
      if (!cars.length) return
      if (!trail.length) seed(x, y, z, facing)
      // Teleports / respawns: start straight behind the engine.
      const h = trail[0]
      if (Math.hypot(x - h[0], z - h[2]) > 6) seed(x, y, z, facing)
      trail[0][0] = x
      trail[0][1] = y
      trail[0][2] = z
      if (trail.length < 2 || Math.hypot(x - trail[1][0], z - trail[1][2]) > STEP) trail.unshift([x, y, z])
      // Backing up over the trail: drop the points the engine has rolled back past.
      while (trail.length > 3) {
        const a = trail[1]
        const b = trail[2]
        if (Math.hypot(x - b[0], z - b[2]) < Math.hypot(a[0] - b[0], a[2] - b[2])) trail.splice(1, 1)
        else break
      }
      let d = rear + RAILCARS.gap
      for (const c of cars) {
        const f = along(d)
        const fx = f[0]
        const fy = f[1]
        const fz = f[2]
        const r = along(d + c.len)
        const m = c.mesh
        m.position.set((fx + r[0]) / 2, (fy + r[1]) / 2, (fz + r[2]) / 2)
        m.rotation.y = Math.atan2(fx - r[0], fz - r[2])
        m.rotation.x = -Math.atan2(fy - r[1], c.len)
        const moved = c.last ? Math.hypot(m.position.x - c.lx, m.position.z - c.lz) : 0
        c.last = true
        c.lx = m.position.x
        c.lz = m.position.z
        for (const w of m.userData.wheels) w.rotation.x += moved / 0.3
        d += c.len + RAILCARS.gap
      }
      // Keep only the trail the wagons need.
      let total = 0
      for (let i = 1; i < trail.length; i++) {
        total += Math.hypot(trail[i][0] - trail[i - 1][0], trail[i][2] - trail[i - 1][2])
        if (total > d + 4) {
          trail.length = i + 1
          break
        }
      }
    },
  }
}
