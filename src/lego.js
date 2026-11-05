import { BoxGeometry, ExtrudeGeometry, Mesh, MeshStandardMaterial, Shape, Vector2 } from 'three'
import { LEGO } from './config.js'
import { heightToNormal, toTexture } from './textures.js'

// The lego look shared by the whole hub: every surface is a studded brick.
//  - One greyscale stud sheet (bevelled cell edges + raised round studs lit
//    from the top-left) and its derived normal map. Materials tint it with
//    their colour, so a hundred colours share two textures.
//  - Geometry UVs are in metres (boxGeo, wedgeGeo, extrusions), so the studs
//    stay LEGO.stud wide on a 1 m crate and on a 130 m wall alike.
//  - A checker variant (blocks of 4 x 4 studs in two shades) for the sand
//    plaza and the paths, like the reference floor.

const PX = 48 // texels per stud cell

function paintStudSheet(cells, checker) {
  const size = cells * PX
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  const img = ctx.createImageData(size, size)
  const height = new Float32Array(size * size)
  const R = 0.27
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = Math.floor(x / PX)
      const cy = Math.floor(y / PX)
      const u = ((x % PX) + 0.5) / PX
      const v = ((y % PX) + 0.5) / PX
      let shade = checker && (Math.floor(cx / 4) + Math.floor(cy / 4)) & 1 ? 0.92 : 1
      let h = 0.4
      const edge = Math.min(u, v, 1 - u, 1 - v)
      if (edge < 0.03) {
        shade *= 0.86
        h = 0.15
      } else if (edge < 0.075) {
        shade *= u < 0.075 || v < 0.075 ? 1.0 : 0.93 // bevel: lit top-left, shaded bottom-right
        h = 0.3
      } else {
        shade *= 0.97
      }
      const du = u - 0.5
      const dv = v - 0.5
      const r = Math.hypot(du, dv)
      if (r < R + 0.035) {
        const lit = (-du - dv) / (r + 1e-5) * 0.7071 // -1..1, toward the top-left
        if (r > R - 0.035) shade *= 0.95 + 0.07 * lit // the stud's rim
        else shade *= 0.99
        h = r < R ? 1 : 0.65
      }
      const i = y * size + x
      height[i] = h
      const g = Math.min(255, shade * 255)
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = g
      img.data[i * 4 + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return { color: c, normal: heightToNormal(height, size, 1.0) }
}

let sheets = null
function studTextures() {
  if (sheets) return sheets
  const plain = paintStudSheet(4, false)
  const check = paintStudSheet(8, true)
  const r4 = 1 / (4 * LEGO.stud)
  const r8 = 1 / (8 * LEGO.stud)
  sheets = {
    plain: { map: toTexture(plain.color, { repeat: r4, srgb: true }), normal: toTexture(plain.normal, { repeat: r4 }) },
    checker: { map: toTexture(check.color, { repeat: r8, srgb: true }), normal: toTexture(check.normal, { repeat: r8 }) },
  }
  return sheets
}

// Studded lego material, cached per colour + options.
const legoCache = new Map()
export function lego(color, { checker = false, rough = 0.72, emissive = null, emissiveIntensity = 1, studs = true } = {}) {
  const key = `${color}|${checker}|${rough}|${emissive}|${emissiveIntensity}|${studs}`
  let m = legoCache.get(key)
  if (m) return m
  const t = studTextures()[checker ? 'checker' : 'plain']
  m = new MeshStandardMaterial({
    color,
    roughness: rough,
    metalness: 0,
    map: studs ? t.map : null,
    normalMap: studs ? t.normal : null,
    normalScale: new Vector2(0.9, 0.9),
  })
  if (emissive) {
    m.emissive.set(emissive)
    m.emissiveIntensity = emissiveIntensity
  }
  legoCache.set(key, m)
  return m
}

// Smooth plastic (train bodies, small trim), cached.
const plasticCache = new Map()
export function plastic(color, { rough = 0.42, metal = 0, emissive = null, emissiveIntensity = 1 } = {}) {
  const key = `${color}|${rough}|${metal}|${emissive}|${emissiveIntensity}`
  let m = plasticCache.get(key)
  if (m) return m
  m = new MeshStandardMaterial({ color, roughness: rough, metalness: metal })
  if (emissive) {
    m.emissive.set(emissive)
    m.emissiveIntensity = emissiveIntensity
  }
  plasticCache.set(key, m)
  return m
}

// Box with UVs in metres on every face (BoxGeometry face order: +x, -x, +y, -y, +z, -z).
const geoCache = new Map()
export function boxGeo(w, h, d) {
  const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}`
  let g = geoCache.get(key)
  if (g) return g
  g = new BoxGeometry(w, h, d)
  const uv = g.attributes.uv
  const dims = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ]
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i
      uv.setXY(k, uv.getX(k) * dims[f][0], uv.getY(k) * dims[f][1])
    }
  }
  geoCache.set(key, g)
  return g
}

// A block: w x h x d, `y` is its BOTTOM (things stack on the ground), turned `ry` about Y.
export function blk(parent, mat, w, h, d, x, y, z, ry = 0) {
  const m = new Mesh(boxGeo(w, h, d), mat)
  m.position.set(x, y + h / 2, z)
  m.rotation.y = ry
  m.castShadow = true
  m.receiveShadow = true
  parent.add(m)
  return m
}

// A centred box (y is the middle), for parts that are rotated about other axes.
export function cbox(parent, mat, w, h, d, x, y, z) {
  const m = new Mesh(boxGeo(w, h, d), mat)
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  parent.add(m)
  return m
}

// Ramp wedge along +X: 0 high at x = 0, `height` at x = length; width along Z, centred.
export function wedgeGeo(length, width, height) {
  const s = new Shape()
  s.moveTo(0, 0)
  s.lineTo(length, 0)
  s.lineTo(length, height)
  s.closePath()
  const g = new ExtrudeGeometry(s, { depth: width, bevelEnabled: false })
  g.translate(0, 0, -width / 2)
  return g
}

// Extrudes an outline given in (x, z) world metres to a slab `thickness` thick whose top is at y = top.
export function slabGeo(points, thickness, holes = []) {
  const s = new Shape()
  points.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z)))
  s.closePath()
  for (const hole of holes) {
    const h = new Shape()
    hole.forEach(([x, z], i) => (i ? h.lineTo(x, -z) : h.moveTo(x, -z)))
    h.closePath()
    s.holes.push(h)
  }
  const g = new ExtrudeGeometry(s, { depth: thickness, bevelEnabled: false, curveSegments: 1 })
  g.rotateX(-Math.PI / 2)
  return g
}

// Regular octagon (flat side facing each axis), circumradius r, as [x, z] points.
export function octagon(r, cx = 0, cz = 0) {
  const pts = []
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + (i * Math.PI) / 4
    pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r])
  }
  return pts
}
