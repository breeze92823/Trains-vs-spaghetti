import {
  ExtrudeGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshLambertMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  Vector2,
} from 'three'
import { BEACH, WATER } from './config.js'
import { RAPIER, addFixed } from './physics.js'
import { mulberry32, paintCrackedSand, paintWaterNormal, toTexture } from './textures.js'

// The ground: a pale cracked-sand slab in a bright cartoon sea, with puffy
// clouds in the sky. Physically the land is one convex-hull collider plus an
// invisible fence on every edge (landColliders).
//
// Texture techniques used here:
//  - sand: tileable Voronoi cells + cracks -> colour + derived normal map,
//    world-space UVs (ExtrudeGeometry caps use shape coordinates = metres)
//  - sea: one ripple normal map used twice (normalMap + clearcoatNormalMap) at
//    different scales, scrolled in different directions each frame, over a
//    lighter shallow-water band hugging the shore

// Outline of the land in world (x, z), counter-clockwise seen from above. Convex.
export function beachOutline() {
  const { front, back, halfWidth: W, wingZ, gateEdge } = BEACH
  return [
    [-W, back],
    [W, back],
    [W, wingZ],
    [gateEdge, front],
    [-gateEdge, front],
    [-W, wingZ],
  ]
}

// Shape space is (x, -z): rotating the extrusion -90 deg about X maps shape y to world -z and depth to +y.
function outlineShape(points, scale = 1, cz = 0) {
  const s = new Shape()
  points.forEach(([x, z], i) => {
    const sx = x * scale
    const sz = cz + (z - cz) * scale
    if (i === 0) s.moveTo(sx, -sz)
    else s.lineTo(sx, -sz)
  })
  s.closePath()
  return s
}

export function makeClouds() {
  const rand = mulberry32(2024)
  const geo = new IcosahedronGeometry(1, 3)
  const mat = new MeshLambertMaterial({ color: '#ffffff', emissive: '#dcebff', emissiveIntensity: 0.62, fog: false })
  const group = new Group()
  for (let i = 0; i < 22; i++) {
    // Mostly ahead (-Z), a few all around.
    const ang = i < 15 ? -Math.PI / 2 + (rand() - 0.5) * Math.PI * 1.25 : rand() * Math.PI * 2
    const dist = 240 + rand() * 170
    const cloud = new Group()
    const puffs = 5 + Math.floor(rand() * 4)
    const len = 22 + rand() * 26
    for (let p = 0; p < puffs; p++) {
      const t = p / (puffs - 1) - 0.5
      const r = (1 - Math.abs(t) * 1.1) * (9 + rand() * 6)
      const puff = new Mesh(geo, mat)
      puff.scale.set(r, r * 0.82, r)
      puff.position.set(t * len, r * 0.25 + rand() * 3, (rand() - 0.5) * 8)
      cloud.add(puff)
    }
    const flat = new Mesh(geo, mat) // flat underside
    flat.scale.set(len * 0.62, 4, 9)
    cloud.add(flat)
    cloud.position.set(Math.cos(ang) * dist, 30 + rand() * 70, Math.sin(ang) * dist)
    cloud.lookAt(0, cloud.position.y, 0)
    group.add(cloud)
  }
  return group
}

// The slab of land (visual): `top` is the material of its flat top, `side` the colour of its
// rounded edge, `shallow` the lighter water band hugging it.
export function buildSlab(root, top, side, shallow) {
  const outline = beachOutline()
  const bevel = 0.6
  const slabGeo = new ExtrudeGeometry(outlineShape(outline), {
    depth: BEACH.depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: 1.2,
    bevelSegments: 3,
    curveSegments: 1,
  })
  slabGeo.rotateX(-Math.PI / 2)
  const slab = new Mesh(slabGeo, [top, new MeshStandardMaterial({ color: side, roughness: 1 })])
  slab.position.y = -(BEACH.depth + bevel)
  slab.receiveShadow = true

  // Shallow water: a lighter band just around the land.
  const cz = (BEACH.front + BEACH.back) / 2
  const shallowGeo = new ShapeGeometry(outlineShape(outline, 1.12, cz))
  shallowGeo.rotateX(-Math.PI / 2)
  const band = new Mesh(shallowGeo, new MeshStandardMaterial({ color: shallow, roughness: 0.3, transparent: true, opacity: 0.55, depthWrite: false }))
  band.position.y = WATER.level + 0.04
  band.renderOrder = 1
  root.add(slab, band)
}

// The land: the cracked-sand slab with a flat top, rounded edge and darker wet sides.
export function buildGround(root) {
  const sand = paintCrackedSand()
  const sandColor = toTexture(sand.color, { repeat: 1 / BEACH.tile, srgb: true })
  const sandNormal = toTexture(sand.normal, { repeat: 1 / BEACH.tile })
  const top = new MeshStandardMaterial({ map: sandColor, normalMap: sandNormal, normalScale: new Vector2(0.6, 0.6), roughness: 1, metalness: 0 })
  buildSlab(root, top, '#dcc08a', WATER.shallow)
}

// Collision for the land: the slab as a convex hull and a fence along every edge.
export function landColliders() {
  const outline = beachOutline()
  const hull = []
  for (const [x, z] of outline) hull.push(x, 0, z, x, -BEACH.depth, z)
  addFixed(RAPIER.ColliderDesc.convexHull(new Float32Array(hull)), { x: 0, y: 0, z: 0 }, null, { friction: 0.9 })
  for (let i = 0; i < outline.length; i++) {
    const [ax, az] = outline[i]
    const [bx, bz] = outline[(i + 1) % outline.length]
    const len = Math.hypot(bx - ax, bz - az)
    const yaw = Math.atan2(-(bz - az), bx - ax)
    addFixed(
      RAPIER.ColliderDesc.cuboid(len / 2 + 0.5, BEACH.fenceHeight / 2, 0.4),
      { x: (ax + bx) / 2, y: BEACH.fenceHeight / 2, z: (az + bz) / 2 },
      { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) },
    )
  }
}

// The sea around the land and the clouds in the sky.
export function createWorld(scene) {
  // Sea: physical material, two scrolling ripple layers, slightly see-through.
  const ripples = paintWaterNormal()
  const normalA = toTexture(ripples, { repeat: WATER.size / 14 })
  const normalB = toTexture(ripples, { repeat: WATER.size / 37 })
  const sea = new Mesh(
    new PlaneGeometry(WATER.size, WATER.size),
    new MeshPhysicalMaterial({
      color: WATER.color,
      roughness: 0.3,
      metalness: 0,
      normalMap: normalA,
      normalScale: new Vector2(0.3, 0.3),
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      clearcoatNormalMap: normalB,
      clearcoatNormalScale: new Vector2(0.5, 0.5),
      transparent: true,
      opacity: 0.94,
    }),
  )
  sea.rotation.x = -Math.PI / 2
  sea.position.y = WATER.level
  sea.receiveShadow = true
  scene.add(sea, makeClouds())

  return {
    setSeaColor: (color) => sea.material.color.set(color),
    update(dt, elapsed) {
      // One ripple tile is 14 m (A) / 37 m (B); v runs toward -Z.
      normalA.offset.set(elapsed * 0.012, elapsed * 0.02)
      normalB.offset.set(-elapsed * 0.008, elapsed * 0.005)
    },
  }
}
