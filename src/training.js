import { AdditiveBlending, BufferGeometry, CanvasTexture, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial } from 'three'
import { PLAYER_TRAIN, TRAINING } from './config.js'
import { player } from './player.js'
import { createEmitter } from './particles.js'
import { spinWheels } from './trains.js'

// Training on a treadmill (TRAINING in config). Rolling onto an unlocked belt
// locks the train onto it (player.training, honoured by player.js): it is drawn
// to a spot just up-slope of the belt centre, turns its nose to the headboard
// and runs in place, tilted onto the slope, wheels spinning flat out and
// bouncing on its springs, chimney pumping thick smoke, white wind streaks
// rushing past both sides. Steering away or jumping lets go.

const T = TRAINING
const rand = (a, b) => a + Math.random() * (b - a)

// One streak: two crossed quads along local Z (visible from above and from the side),
// alpha fading toward both tips through a gradient alpha map.
function streakGeometry() {
  const w = T.streaks.width / 2
  const pos = [
    // flat (XZ)
    -w, 0, -0.5, w, 0, -0.5, w, 0, 0.5, -w, 0, 0.5,
    // upright (YZ)
    0, -w, -0.5, 0, w, -0.5, 0, w, 0.5, 0, -w, 0.5,
  ]
  const uv = [0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1]
  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3))
  geo.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  geo.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7])
  return geo
}

function streakAlpha() {
  const c = document.createElement('canvas')
  c.width = 4
  c.height = 64
  const ctx = c.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 0, 64)
  g.addColorStop(0, 'rgba(255,255,255,0)')
  g.addColorStop(0.35, 'rgba(255,255,255,1)')
  g.addColorStop(0.7, 'rgba(255,255,255,0.8)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 4, 64)
  return new CanvasTexture(c)
}

// holder: the group the train rides in (positioned at the feet, not rotated); train: its model.
export function createTraining(scene, holder, train) {
  train.rotation.order = 'YXZ' // yaw, then the slope pitch in the train's own frame

  // --- Wind streaks -------------------------------------------------------------------------
  const S = T.streaks
  const streaks = new Group()
  streaks.visible = false
  holder.add(streaks)
  const geo = streakGeometry()
  const alphaMap = streakAlpha()
  const lines = []
  const respawnLine = (l, z) => {
    const side = Math.random() < 0.5 ? -1 : 1
    l.mesh.position.set(side * rand(S.side[0], S.side[1]), rand(S.height[0], S.height[1]), z)
    l.len = rand(S.length[0], S.length[1])
    l.speed = S.speed * rand(0.8, 1.25)
    l.mesh.scale.set(1, 1, l.len)
  }
  for (let i = 0; i < S.count; i++) {
    const mat = new MeshBasicMaterial({ color: '#ffffff', alphaMap, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false })
    const mesh = new Mesh(geo, mat)
    mesh.frustumCulled = false
    mesh.renderOrder = 5
    streaks.add(mesh)
    const l = { mesh, mat, len: 1, speed: S.speed }
    respawnLine(l, rand(S.back, S.front))
    lines.push(l)
  }

  // --- Thick smoke, shown only while training -------------------------------------------------
  const at = train.userData.smoke
  const sm = T.smoke
  const smoke = at
    ? createEmitter(scene, {
        parent: train,
        boxes: [{ x: at.x, y: at.y, z: at.z, sx: 0.1, sy: 0.05, sz: 0.1 }],
        count: sm.count,
        life: sm.life,
        velocity: sm.velocity,
        spread: sm.spread,
        gravity: -0.6,
        size: sm.size,
        grow: sm.grow,
        color: PLAYER_TRAIN.smoke,
        intensity: sm.intensity,
        opacity: sm.opacity,
        seed: 21,
      })
    : null
  if (smoke) smoke.visible = false

  let level = 0 // 0..1 eased "how much training" for the effects
  let pitch = 0
  let clock = 0

  return {
    get on() {
      return !!player.training
    },
    // zone: the unlocked belt under the train (tracker.active) or null. Before the physics step.
    lock(zone) {
      if (!zone) {
        player.training = null
        player.trainingLetGo = false
        return
      }
      if (player.training?.zone === zone || player.trainingLetGo || !player.grounded) return
      player.training = {
        zone,
        x: zone.cx + zone.dir * T.hold,
        z: zone.cz,
        ux: zone.dir,
        uz: 0,
        facing: (zone.dir * Math.PI) / 2, // the model faces +Z at 0; +X is pi/2
      }
    },
    // After the train has been placed for this frame. Returns the wheel distance it added.
    update(dt) {
      const tr = player.training
      const target = tr ? 1 : 0
      level += (target - level) * (1 - Math.exp(-6 * dt))
      clock += dt
      pitch += ((tr ? -tr.zone.angle : 0) - pitch) * (1 - Math.exp(-T.pitchEase * dt))
      train.rotation.x = pitch
      if (tr) {
        spinWheels(train, T.wheelSpeed * dt)
        train.position.y = Math.abs(Math.sin(clock * T.bobRate)) * T.bob
      }
      if (smoke) smoke.visible = level > 0.5

      streaks.visible = level > 0.02
      if (!streaks.visible) return
      streaks.rotation.y = player.facing
      for (const l of lines) {
        const p = l.mesh.position
        p.z -= l.speed * dt
        if (p.z < S.back) respawnLine(l, S.front + Math.random() * 1.5)
        // Fade in at the nose, out behind the train.
        const k = Math.min(1, (S.front + 1.5 - p.z) / 1.6, (p.z - S.back) / 2)
        l.mat.opacity = Math.max(0, k) * S.opacity * level
      }
    },
  }
}
