import { CylinderGeometry, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, Path, Shape, SphereGeometry, TorusGeometry } from 'three'
import { cbox, plastic } from './lego.js'

// Procedural toy trains, built from boxes and cylinders in the chunky
// simulator style of the reference. Every model faces +Z (rotation.y =
// facing works like the avatar did), sits with its wheels on y = 0, and
// carries in userData:
//   wheels  - meshes spun about their axle by spinWheels(group, metres)
//   smoke   - local point above the chimney (steam engines) or null
//   length  - nose-to-tail length, m
//   kind    - spec.kind (the train sounds pick their engine voice from it)
//   cab     - where the driver stands (driver.js): { x, y, z, wall, win, glow }:
//             the open side window's centre (y, z) and size (win), the side wall's
//             outer x (wall), the driver's resting x, and the control panel's glowing
//             light (firebox / screen) that driver.js flickers
// Kinds (spec.kind): 'steam' (the player's starter), 'diesel' (long hood +
// cab), 'bullet' (streamlined high-speed), 'modern' (boxy electric with a
// raked cab), 'shunter' (small yard engine with warning stripes).

const DARK = '#1c1c21'
const STEEL = '#9a9aa2'

const cylCache = new Map()
function cylGeo(rTop, rBottom, h, seg = 18) {
  const key = `${rTop}|${rBottom}|${h}|${seg}`
  let g = cylCache.get(key)
  if (!g) cylCache.set(key, (g = new CylinderGeometry(rTop, rBottom, h, seg)))
  return g
}

function add(parent, geo, mat, x, y, z) {
  const m = new Mesh(geo, mat)
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  parent.add(m)
  return m
}

// A cylinder lying along Z (boilers), centred at (x, y, z).
function tubeZ(parent, r, len, mat, x, y, z, seg = 20) {
  const m = add(parent, cylGeo(r, r, len, seg), mat, x, y, z)
  m.rotation.x = Math.PI / 2
  return m
}

// One wheel per side at axle (z), radius r. Spoked look: coloured disc, dark hub, steel rim.
function axle(group, z, r, halfTrack, color) {
  const wheelMat = plastic(color, { rough: 0.5 })
  const hub = plastic(DARK)
  const rim = plastic(STEEL, { rough: 0.35, metal: 0.4 })
  for (const s of [-1, 1]) {
    const w = add(group, cylGeo(r, r, 0.16, 20), wheelMat, s * halfTrack, r, z)
    w.rotation.z = Math.PI / 2
    // Local Y is the axle (the cylinder is turned onto X by rotation.z).
    const ring = new Mesh(new TorusGeometry(r * 0.92, 0.045, 6, 20), rim)
    w.add(ring)
    ring.rotation.x = Math.PI / 2
    ring.position.set(0, s * 0.085, 0)
    const cap = add(w, cylGeo(r * 0.32, r * 0.32, 0.2, 10), hub, 0, s * 0.03, 0)
    cap.castShadow = false
    // Spokes: two crossed bars, so the spin reads.
    for (let k = 0; k < 2; k++) {
      const sp = add(w, cylGeo(0.035, 0.035, r * 1.7, 5), hub, 0, s * 0.07, 0)
      sp.rotation.x = Math.PI / 2
      sp.rotation.z = (k * Math.PI) / 2
      sp.castShadow = false
    }
    group.userData.wheels.push(w)
  }
}

// Bogie: dark frame + two axles.
function bogie(group, z, r, color) {
  cbox(group, plastic(DARK), 1.2, 0.34, 1.5, 0, r + 0.05, z)
  axle(group, z - 0.45, r, 0.66, color)
  axle(group, z + 0.45, r, 0.66, color)
}

function lamp(group, x, y, z, size = 0.22) {
  const m = cbox(group, plastic('#fff6c8', { emissive: '#ffe680', emissiveIntensity: 2.2 }), size, size, 0.08, x, y, z)
  m.castShadow = false
  return m
}

// Window: black glass with a white frame, on the plane x = side (normal ±X) or front (normal ±Z).
function sideWindow(group, side, w, h, y, z, glass = '#14141a', frame = '#f2f2f2') {
  cbox(group, plastic(frame), 0.04, h + 0.12, w + 0.12, side, y, z).castShadow = false
  cbox(group, plastic(glass, { rough: 0.15 }), 0.06, h, w, side + Math.sign(side) * 0.01, y, z).castShadow = false
}
function frontWindow(group, x, w, h, y, z, glass = '#14141a', frame = '#f2f2f2') {
  cbox(group, plastic(frame), w + 0.12, h + 0.12, 0.04, x, y, z).castShadow = false
  cbox(group, plastic(glass, { rough: 0.15 }), w, h, 0.06, x, y, z + Math.sign(z) * 0.01).castShadow = false
}

// A rectangular hole (z0, y0)-(z1, y1) in a side profile, grown by the bevel so the
// finished opening is exactly that size (the bevel thickens the solid into a hole).
function holePath(s, [z0, y0, z1, y1], bevel) {
  const h = new Path()
  h.moveTo(z0 - bevel, y0 - bevel)
  h.lineTo(z0 - bevel, y1 + bevel)
  h.lineTo(z1 + bevel, y1 + bevel)
  h.lineTo(z1 + bevel, y0 - bevel)
  h.closePath()
  s.holes.push(h)
}
const winHole = (win) => [win.z - win.w / 2, win.y - win.h / 2, win.z + win.w / 2, win.y + win.h / 2]

// Side-profile extrusion: `pts` are (z, y) metres, extruded `width` wide across X, centred.
// `holes`: rectangles cut straight through both sides (the cab's open windows).
function profile(group, pts, width, mat, holes = []) {
  const s = new Shape()
  pts.forEach(([z, y], i) => (i ? s.lineTo(z, y) : s.moveTo(z, y)))
  s.closePath()
  for (const h of holes) holePath(s, h, 0.06)
  const g = new ExtrudeGeometry(s, { depth: width, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2, curveSegments: 6 })
  g.rotateY(-Math.PI / 2) // shape x -> world z, extrusion -> world -x
  g.translate(width / 2, 0, 0)
  return add(group, g, mat, 0, 0, 0)
}
function profileCurve(group, build, width, mat, holes = []) {
  const s = new Shape()
  build(s)
  for (const h of holes) holePath(s, h, 0.06)
  const g = new ExtrudeGeometry(s, { depth: width, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2, curveSegments: 10 })
  g.rotateY(-Math.PI / 2)
  g.translate(width / 2, 0, 0)
  return add(group, g, mat, 0, 0, 0)
}

// --- The driver's cab -------------------------------------------------------------
// A box cab (w across X, h, d along Z, centred at x, y, z) with the side window cut
// straight through both walls, so the driver can be seen inside and lean out.
// `win` = { y, z, w, h }: the opening's centre and size on the side wall.
function cabBox(group, mat, w, h, d, x, y, z, win) {
  const b = 0.04
  const s = new Shape()
  s.moveTo(z - d / 2 + b, y - h / 2 + b)
  s.lineTo(z + d / 2 - b, y - h / 2 + b)
  s.lineTo(z + d / 2 - b, y + h / 2 - b)
  s.lineTo(z - d / 2 + b, y + h / 2 - b)
  s.closePath()
  holePath(s, winHole(win), b)
  const g = new ExtrudeGeometry(s, { depth: w - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 1, curveSegments: 1 })
  g.rotateY(-Math.PI / 2)
  g.translate(x + (w - 2 * b) / 2, 0, 0)
  return add(group, g, mat, 0, 0, 0)
}

// Frame round the open window on both side walls (outer face at x = +-side), with a
// deeper sill the driver rests an arm on.
function windowFrame(group, side, win, color = '#f2f2f2') {
  const m = plastic(color)
  const t = 0.07
  for (const s of [-1, 1]) {
    const x = s * (side + 0.01)
    cbox(group, m, 0.05, t, win.w + 2 * t, x, win.y + win.h / 2 + t / 2, win.z).castShadow = false
    cbox(group, m, 0.12, t, win.w + 2 * t, s * (side + 0.03), win.y - win.h / 2 - t / 2, win.z).castShadow = false
    for (const dz of [-1, 1]) cbox(group, m, 0.05, win.h, t, x, win.y, win.z + dz * (win.w / 2 + t / 2)).castShadow = false
  }
}

// What the driver faces through the window: a dark backplate on the front wall of
// the opening with the firebox door glowing (steam) or a lit screen (the rest), and
// gauges. Fills userData.cab; driverX is where the driver stands across the cab.
function cabInterior(group, kind, win, width, driverX = 0.3) {
  const zf = win.z + win.w / 2 - 0.012
  cbox(group, plastic('#26262c'), width - 0.12, win.h, 0.02, 0, win.y, zf).castShadow = false
  const face = zf - 0.014
  const glowMat = (color, emissive) => new MeshStandardMaterial({ color, emissive, emissiveIntensity: 2.4, roughness: 0.5 })
  let glow
  if (kind === 'steam') {
    glow = cbox(group, glowMat('#ff9a3a', '#ff6410'), 0.34, 0.15, 0.02, -0.2, win.y - win.h / 2 + 0.09, face)
    for (const x of [-0.32, 0.12]) cbox(group, plastic('#f4f1e6'), 0.11, 0.11, 0.02, x, win.y + 0.13, face).castShadow = false
    cbox(group, plastic('#c9a23a', { metal: 0.6, rough: 0.3 }), 0.5, 0.04, 0.03, -0.1, win.y + 0.02, face).castShadow = false // brass pipe
  } else {
    glow = cbox(group, glowMat('#7fe8ff', '#2ec8ff'), 0.36, 0.15, 0.02, -0.18, win.y - 0.04, face)
    for (const [x, c] of [[0.2, '#ff4040'], [0.32, '#46ff6a']]) cbox(group, plastic(c, { emissive: c, emissiveIntensity: 1.6 }), 0.06, 0.06, 0.02, x, win.y - 0.06, face).castShadow = false
  }
  glow.castShadow = false
  group.userData.cab = { x: driverX, y: win.y, z: win.z, wall: width / 2, win, glow }
}

// --- Steam ---------------------------------------------------------------------
function steam(g, s) {
  const body = plastic(s.body)
  const boiler = plastic(s.boiler ?? DARK, { rough: 0.35 })
  const trim = plastic(s.trim ?? s.body)
  const roof = plastic(s.roof ?? DARK)
  const red = plastic('#c0262b')
  // Frame + buffer beams.
  cbox(g, plastic(DARK), 1.2, 0.3, 3.5, 0, 0.62, 0.05)
  cbox(g, red, 1.55, 0.34, 0.16, 0, 0.6, 1.82)
  cbox(g, red, 1.55, 0.34, 0.16, 0, 0.6, -1.72)
  for (const x of [-0.55, 0.55]) tubeZ(g, 0.08, 0.25, plastic(STEEL, { metal: 0.5, rough: 0.3 }), x, 0.6, 1.98, 10) // buffers
  // Driving wheels + coupling rod.
  for (const z of [1.0, 0.08, -0.84]) axle(g, z, 0.43, 0.68, s.wheel ?? s.body)
  for (const x of [-0.79, 0.79]) cbox(g, plastic(STEEL, { metal: 0.5, rough: 0.3 }), 0.05, 0.08, 1.95, x, 0.38, 0.08)
  // Running boards + side tanks.
  for (const x of [-0.66, 0.66]) {
    cbox(g, body, 0.32, 0.12, 2.3, x, 0.86, 0.6)
    cbox(g, body, 0.26, 0.5, 1.5, x, 1.15, 0.45)
  }
  // Boiler with coloured bands, smokebox, door.
  tubeZ(g, 0.56, 2.05, boiler, 0, 1.3, 0.62)
  for (const z of [-0.28, 0.45, 1.2]) tubeZ(g, 0.585, 0.12, trim, 0, 1.3, z)
  tubeZ(g, 0.6, 0.26, plastic('#151518', { rough: 0.5 }), 0, 1.3, 1.73)
  tubeZ(g, 0.42, 0.06, plastic('#2a2a30'), 0, 1.3, 1.88)
  lamp(g, 0, 1.98, 1.82, 0.26)
  // Chimney (flared), dome, whistle.
  add(g, cylGeo(0.2, 0.16, 0.62), boiler, 0, 2.08, 1.42)
  add(g, cylGeo(0.3, 0.22, 0.2), trim, 0, 2.45, 1.42)
  const dome = add(g, new SphereGeometry(0.28, 14, 10), trim, 0, 1.82, 0.42)
  dome.scale.set(1, 0.85, 1)
  add(g, cylGeo(0.05, 0.05, 0.3, 8), plastic('#e0b040', { metal: 0.6, rough: 0.3 }), 0, 1.98, -0.05)
  // Cab.
  const win = { y: 1.68, z: -0.98, w: 0.6, h: 0.56 }
  cabBox(g, body, 1.5, 1.45, 1.35, 0, 1.47, -0.98, win)
  cbox(g, roof, 1.72, 0.14, 1.6, 0, 2.26, -0.98)
  cbox(g, trim, 1.54, 0.12, 1.39, 0, 0.82, -0.98)
  windowFrame(g, 0.75, win)
  cabInterior(g, 'steam', win, 1.5)
  for (const x of [-0.42, 0.42]) frontWindow(g, x, 0.36, 0.36, 1.78, -0.29)
  // Cowcatcher: slanted steel bars.
  const steel = plastic('#a9a9b0', { metal: 0.3, rough: 0.4 })
  for (let i = -3; i <= 3; i++) {
    const bar = cbox(g, steel, 0.06, 0.06, 0.62, i * 0.2, 0.36, 2.08)
    bar.rotation.x = -0.62
  }
  cbox(g, steel, 1.45, 0.07, 0.07, 0, 0.55, 1.92)
  g.userData.smoke = { x: 0, y: 2.6, z: 1.42 }
  g.userData.length = 4.2
}

// --- Diesel (long hood) ---------------------------------------------------------
function diesel(g, s) {
  const body = plastic(s.body)
  const stripe = plastic(s.stripe ?? '#f4d23a')
  const roof = plastic(s.roof ?? DARK)
  cbox(g, plastic(DARK), 1.45, 0.32, 4.6, 0, 0.82, 0)
  bogie(g, 1.45, 0.33, DARK)
  bogie(g, -1.45, 0.33, DARK)
  // Long hood (rear), cab, short nose.
  cbox(g, body, 1.18, 1.2, 2.75, 0, 1.58, -0.75)
  const win = { y: 2.18, z: 1.12, w: 0.6, h: 0.52 }
  cabBox(g, body, 1.55, 1.62, 1.05, 0, 1.79, 1.12, win)
  cbox(g, body, 1.18, 0.95, 0.7, 0, 1.45, 1.98)
  cbox(g, roof, 1.66, 0.12, 1.15, 0, 2.66, 1.12)
  for (let i = 0; i < 4; i++) cbox(g, roof, 0.9, 0.1, 0.42, 0, 2.23, -1.8 + i * 0.62) // roof vents
  // Stripes: side band + nose chevron.
  for (const x of [-0.6, 0.6]) cbox(g, stripe, 0.04, 0.2, 2.75, x * 1.003, 1.3, -0.75)
  for (const x of [-0.78, 0.78]) cbox(g, stripe, 0.04, 0.2, 1.05, x, 1.3, 1.12)
  cbox(g, stripe, 1.2, 0.2, 0.04, 0, 1.3, 2.34)
  if (s.camo) {
    const camo = plastic(s.stripe)
    const spots = [
      [-0.6, 1.8, -1.6, 0.5, 0.4], [0.6, 1.6, -0.9, 0.7, 0.35], [-0.6, 1.5, -0.2, 0.6, 0.5], [0.6, 1.9, 0.1, 0.45, 0.3], [-0.6, 1.95, -0.9, 0.4, 0.25],
    ]
    for (const [x, y, z, d, h] of spots) cbox(g, camo, 0.05, h, d, x * 1.01, y, z)
  }
  for (const x of [-0.42, 0.42]) frontWindow(g, x, 0.48, 0.42, 2.25, 1.66)
  windowFrame(g, 0.775, win)
  cabInterior(g, 'diesel', win, 1.55)
  lamp(g, -0.38, 1.7, 2.35)
  lamp(g, 0.38, 1.7, 2.35)
  // Handrails along the hood.
  for (const x of [-0.72, 0.72]) cbox(g, plastic('#d8d8de'), 0.04, 0.04, 2.8, x, 1.95, -0.75).castShadow = false
  g.userData.length = 4.8
}

// --- Bullet (streamlined) ---------------------------------------------------------
function bullet(g, s) {
  const body = plastic(s.body, { rough: 0.3 })
  const stripe = plastic(s.stripe ?? '#ffffff', { rough: 0.3 })
  const glass = plastic(s.window ?? '#14141a', { rough: 0.1 })
  const win = { y: 1.62, z: 1.0, w: 0.56, h: 0.46 }
  profileCurve(
    g,
    (sh) => {
      sh.moveTo(-2.3, 0.62)
      sh.lineTo(1.4, 0.62)
      sh.bezierCurveTo(2.5, 0.62, 2.75, 0.95, 2.55, 1.15)
      sh.bezierCurveTo(2.2, 1.55, 1.7, 2.05, 0.6, 2.1)
      sh.lineTo(-2.05, 2.1)
      sh.quadraticCurveTo(-2.3, 2.1, -2.3, 1.85)
      sh.closePath()
    },
    1.42,
    body,
    [winHole(win)],
  )
  cbox(g, plastic(DARK), 1.3, 0.3, 4.3, 0, 0.6, -0.1)
  bogie(g, 1.1, 0.3, DARK)
  bogie(g, -1.5, 0.3, DARK)
  // Window band, stripe, windscreen.
  for (const x of [-0.78, 0.78]) {
    cbox(g, glass, 0.04, 0.36, 2.6, x, 1.62, -0.8).castShadow = false
    cbox(g, stripe, 0.04, 0.16, 4.2, x, 1.08, -0.1).castShadow = false
  }
  const ws = cbox(g, glass, 1.15, 0.05, 0.85, 0, 1.78, 1.55)
  ws.rotation.x = 0.72
  ws.castShadow = false
  windowFrame(g, 0.77, win, s.stripe ?? '#ffffff')
  cabInterior(g, 'bullet', win, 1.54)
  const nose = cbox(g, stripe, 0.5, 0.05, 0.7, 0, 1.12, 2.45)
  nose.rotation.x = -1.2
  lamp(g, -0.42, 1.0, 2.42, 0.2)
  lamp(g, 0.42, 1.0, 2.42, 0.2)
  g.userData.length = 5
}

// --- Modern (boxy electric, raked cab) --------------------------------------------------
function modern(g, s) {
  const body = plastic(s.body, { rough: 0.35 })
  const stripe = plastic(s.stripe ?? '#ffffff')
  const glass = plastic(s.window ?? '#14141a', { rough: 0.1 })
  const win = { y: 1.62, z: 1.15, w: 0.56, h: 0.46 }
  profile(g, [[-2.2, 0.62], [1.85, 0.62], [2.25, 0.95], [2.25, 1.35], [1.65, 2.15], [-2.2, 2.15]], 1.42, body, [winHole(win)])
  windowFrame(g, 0.77, win, s.stripe ?? '#ffffff')
  cabInterior(g, 'modern', win, 1.54)
  cbox(g, plastic(DARK), 1.3, 0.3, 4.2, 0, 0.6, 0)
  bogie(g, 1.25, 0.32, DARK)
  bogie(g, -1.35, 0.32, DARK)
  for (const x of [-0.78, 0.78]) {
    cbox(g, stripe, 0.04, 0.22, 4.1, x, 1.0, 0).castShadow = false
    for (let i = 0; i < 3; i++) cbox(g, glass, 0.04, 0.38, 0.55, x, 1.62, -1.6 + i * 0.85).castShadow = false
  }
  const ws = cbox(g, glass, 1.2, 0.05, 0.78, 0, 1.76, 1.96)
  ws.rotation.x = 0.93
  ws.castShadow = false
  cbox(g, stripe, 1.3, 0.2, 0.05, 0, 1.0, 2.3).castShadow = false
  // Pantograph.
  const pan = plastic('#c9ccd4', { metal: 0.4 })
  cbox(g, plastic(DARK), 0.8, 0.12, 0.8, 0, 2.28, -0.9)
  const arm = cbox(g, pan, 0.06, 0.06, 0.9, 0, 2.55, -0.9)
  arm.rotation.x = 0.6
  cbox(g, pan, 0.9, 0.05, 0.08, 0, 2.78, -0.6)
  lamp(g, -0.45, 1.2, 2.3, 0.2)
  lamp(g, 0.45, 1.2, 2.3, 0.2)
  g.userData.length = 4.6
}

// --- Shunter -----------------------------------------------------------------------
function shunter(g, s) {
  const body = plastic(s.body)
  const stripe = plastic(s.stripe ?? '#1a1a1a')
  cbox(g, plastic(DARK), 1.4, 0.3, 3.4, 0, 0.72, 0)
  axle(g, 0.95, 0.4, 0.66, DARK)
  axle(g, -0.95, 0.4, 0.66, DARK)
  cbox(g, body, 1.15, 1.05, 1.9, 0, 1.4, 0.65)
  const win = { y: 1.92, z: -1.05, w: 0.6, h: 0.52 }
  cabBox(g, body, 1.5, 1.6, 1.15, 0, 1.67, -1.05, win)
  cbox(g, stripe, 1.62, 0.12, 1.3, 0, 2.52, -1.05)
  // Warning chevrons on the nose and the frame ends.
  for (let i = 0; i < 4; i++) {
    const c = cbox(g, stripe, 0.18, 0.95, 0.05, -0.42 + i * 0.28, 1.4, 1.61)
    c.rotation.z = 0.6
    c.castShadow = false
  }
  for (const z of [1.72, -1.72]) cbox(g, stripe, 1.45, 0.3, 0.06, 0, 0.72, z)
  windowFrame(g, 0.75, win)
  cabInterior(g, 'shunter', win, 1.5)
  frontWindow(g, 0, 0.8, 0.4, 2.0, -0.47)
  add(g, cylGeo(0.12, 0.12, 0.5, 10), stripe, 0.3, 2.1, 1.1) // exhaust
  lamp(g, 0, 1.75, 1.62)
  g.userData.length = 3.6
}

const BUILDERS = { steam, diesel, bullet, modern, shunter }

export function buildTrain(spec) {
  const g = new Group()
  g.userData.wheels = []
  g.userData.smoke = null
  g.userData.cab = null
  g.userData.kind = BUILDERS[spec.kind] ? spec.kind : 'steam'
  ;(BUILDERS[spec.kind] ?? steam)(g, spec)
  return g
}

// Rolls every wheel by the distance travelled (m).
export function spinWheels(group, distance) {
  for (const w of group.userData.wheels) {
    const r = w.geometry.parameters.radiusTop
    w.rotation.x += distance / r
  }
}
