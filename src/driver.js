// The driver: the player's own Bloxity avatar (player.glb dressed with their equipped
// cosmetics and proportions, avatar/) standing in the train's cab at the open side
// window (trains.js userData.cab), config DRIVER.
//
// It reads the train's real motion, not a timer: a "felt" speed lags the real one
// (DRIVER.inertia), so pulling away leans the driver back with the regulator hand
// pulled, braking pitches them forward, and curves sway them out of the turn. Each rail
// joint (audio/train.js calls bump) jolts them, the engine buzzes through them at
// speed, and they breathe and glance around.
//
// Leaning out of the window (+X side) is a spring (slight overshoot, no snapping): the
// hips slide to the wall and rise to the sill, the torso bends out over it, the neck
// counter-tilts so the head stays level, the window arm rests on the sill. Out there the head shakes in the wind and ducks into it at speed.
// They lean out on departure, on stopping (with a wave and a nod), entering the lane and
// now and then at speed.
//   createDriver(holder, { onDepart(kind), onStop(peakSpeed, kind) })
//     -> { update(dt, elapsed), bump(strength, delay), leanOut(seconds, wave),
//          kind, out (0..1 how far out of the window), motion }
import { Group, Vector3 } from 'three'
import { DRIVER, PLAYER_DIMS, RIG_HEIGHT, TRAINING } from './config.js'
import { loadBaseCharacter } from './avatar/character.js'
import { applyProportions, attachEquippedAccessories } from './avatar/loader.js'
import { PlayerRig, PoseBuffer } from './avatar/rig.js'
import { EmotePlayer } from './avatar/emote.js'
import * as bloxity from './bloxity.js'
import { player } from './player.js'

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
const rnd = ([lo, hi]) => lo + Math.random() * (hi - lo)
const damp = (cur, goal, rate, dt) => cur + (goal - cur) * (1 - Math.exp(-rate * dt))
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))
const STEP = 1 / 120 // spring sub-step

// Online: `source` is what the driver reads the train's motion from (default: the local player;
// a remote player passes a { velocity: {x, z}, facing, grounded, training, autoRun } object that
// remotePlayers.js keeps up to date) and `look` replaces the local Bloxity avatar with another
// player's { equipped, proportions, skin } (set later with setLook). Emotes: playEmote(clip, onEnd).
export function createDriver(holder, { onDepart, onStop, source = player, look = null } = {}) {
  const src = source
  const remote = !!look
  let remoteLook = look && look.equipped !== undefined ? look : null
  const seat = new Group() // at the cab: feet so the head sits at the window's centre
  seat.name = 'driver'
  holder.add(seat)
  const body = new Group() // the lean slide, the joint bounce and the engine buzz
  seat.add(body)

  let root = null
  let rig = null
  let headY = 0.85 // m from the feet to the head's centre (measured once loaded)
  let hipToHead = 0.45
  const pose = new PoseBuffer()
  const v = new Vector3()

  // --- The avatar ----------------------------------------------------------------
  function measure() {
    if (!rig || !root) return
    rig.resetToBindPose()
    holder.updateWorldMatrix(true, true)
    const local = (node) => body.worldToLocal(node.getWorldPosition(v)).y
    const unit = (PLAYER_DIMS.height / RIG_HEIGHT) * DRIVER.scale
    const neck = root.nodes.Neck1
    const hip = root.nodes.Spine1
    if (neck) headY = local(neck) + 0.8 * unit // the head's centre: one head radius above the neck
    if (hip) hipToHead = headY - local(hip)
  }
  function fit(proportions) {
    applyProportions(root, proportions)
    root.scale.multiplyScalar(DRIVER.scale)
    measure()
  }
  let loadId = 0
  async function load() {
    const id = ++loadId
    const next = await loadBaseCharacter()
    if (id !== loadId) return
    const equipped = remote ? remoteLook?.equipped : bloxity.getEquippedAvatar()
    const skin = remote ? remoteLook?.skin : bloxity.getSkinTextureUrl()
    if (equipped) await attachEquippedAccessories(next, equipped, { skinTextureUrl: skin || undefined })
    if (id !== loadId) return
    next.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh) {
        o.castShadow = true
        o.receiveShadow = true // the cab's shade falls on them
        // The legs stay below the sill, inside the cab, in every pose: never seen, and
        // hidden they can't poke through the wall when the driver leans out.
        if (/leg/i.test(o.name)) o.visible = false
      }
    })
    if (root) body.remove(root)
    root = next
    body.add(root)
    rig = new PlayerRig(root) // still in its bind pose here
    emote = new EmotePlayer(root)
    fit(remote ? remoteLook?.proportions : bloxity.getProportions())
  }
  const offs = []
  if (!remote) {
    load()
    offs.push(bloxity.onAvatarChanged(() => load())) // may fire twice; the stale load is dropped
    offs.push(bloxity.onProportionsChanged((p) => root && fit(p)))
  } else if (remoteLook) load()
  // A remote driver is dressed with the other player's look (their roster `avatar`).
  function setLook(next) {
    if (!remote) return
    const same = !!remoteLook && JSON.stringify(next?.equipped) === JSON.stringify(remoteLook?.equipped) && (next?.skin ?? '') === (remoteLook?.skin ?? '')
    const first = !remoteLook
    remoteLook = next
    if (first || !same) load()
    else if (root) fit(next?.proportions)
  }
  let emote = null
  let pendingEmote = null
  function playEmote(clip, onEnd) {
    if (!clip) return
    if (emote) emote.play(clip, onEnd)
    else pendingEmote = { clip, onEnd } // the avatar is still loading
  }
  function dispose() {
    loadId++
    for (const off of offs) off?.()
    if (seat.parent) seat.parent.remove(seat)
    seat.traverse((o) => {
      o.geometry?.dispose?.()
    })
  }

  // --- Motion state ----------------------------------------------------------------
  let kind = 'steam'
  let felt = 0 // lagging speed: real - felt = surge (+ pulling away, - braking)
  let surgeS = 0
  let yawRate = 0
  let lastFacing = src.facing
  let stoppedFor = 10
  let movingFor = 0
  let peak = 0
  let wasAuto = false
  const motion = { speed: 0, surge: 0, lateral: 0, grounded: true }

  // Lean-out spring, the wave, the glance, the joint bounce.
  let lean = 0
  let leanV = 0
  let leanLeft = 0
  let waveLeft = 0
  let wave = 0
  let nod = 0
  let cruiseIn = rnd(DRIVER.cruiseLean)
  let glance = 0
  let glanceGoal = 0
  let glanceIn = rnd(DRIVER.glance.every)
  let bumpY = 0
  let bumpV = 0
  const bumps = [] // { at: s from now, k }

  function leanOut(seconds, waving = false) {
    leanLeft = Math.max(leanLeft, seconds)
    if (waving) waveLeft = seconds
  }
  function bump(strength, delay = 0) {
    if (bumps.length < 8) bumps.push({ at: delay, k: strength })
  }

  const addDef = (def, w) => {
    if (w <= 0.001) return
    for (const bone in def) {
      const r = def[bone]
      pose.add(bone, (r.x ?? 0) * w, (r.y ?? 0) * w, (r.z ?? 0) * w)
    }
  }

  function update(dt, elapsed) {
    let model = null
    for (const c of holder.children) if (c.userData.cab) model = c
    const cab = model?.userData.cab
    seat.visible = !!(cab && root)
    if (!cab || !(dt > 0)) return
    kind = model.userData.kind ?? 'steam'

    // How the train is moving.
    // On a treadmill the train runs flat out in place: drive (and sound) at the belt's speed.
    const speed = src.training ? TRAINING.wheelSpeed : Math.hypot(src.velocity.x, src.velocity.z)
    felt = damp(felt, speed, 1 / DRIVER.inertia, dt)
    const surge = speed - felt
    surgeS = damp(surgeS, surge, 10, dt)
    yawRate = damp(yawRate, wrap(src.facing - lastFacing) / dt, 8, dt)
    lastFacing = src.facing
    const lateral = yawRate * speed
    motion.speed = speed
    motion.surge = surgeS
    motion.lateral = lateral
    motion.grounded = src.grounded

    // Departures, stops, the lane.
    if (speed < DRIVER.stopSpeed) {
      if (movingFor > 0 && peak > DRIVER.stopFrom) {
        leanOut(DRIVER.leanFor.stop, true)
        nod = 1
        onStop?.(peak, kind)
      }
      movingFor = 0
      peak = 0
      stoppedFor += dt
    } else {
      if (stoppedFor > DRIVER.departAfter && speed > 1.5) {
        leanOut(DRIVER.leanFor.depart)
        onDepart?.(kind)
      }
      if (speed > 1.5) stoppedFor = 0
      movingFor += dt
      peak = Math.max(peak, speed)
    }
    if (src.autoRun && !wasAuto) leanOut(DRIVER.leanFor.lane)
    wasAuto = !!src.autoRun
    if (speed > 3 && leanLeft <= 0) {
      cruiseIn -= dt
      if (cruiseIn <= 0) {
        cruiseIn = rnd(DRIVER.cruiseLean)
        leanOut(rnd(DRIVER.leanFor.cruise))
      }
    }
    leanLeft = Math.max(0, leanLeft - dt)
    waveLeft = Math.max(0, waveLeft - dt)

    // Springs, sub-stepped so a long frame can't blow them up.
    const S = DRIVER.spring
    const B = DRIVER.bump
    const target = leanLeft > 0 ? 1 : 0
    for (let i = 0; i < bumps.length; i++) {
      bumps[i].at -= dt
      if (bumps[i].at <= 0) {
        bumpV -= B.kick * bumps[i].k * Math.sqrt(B.stiffness) // a jolt down, then the springs recover
        bumps.splice(i--, 1)
      }
    }
    for (let left = dt; left > 1e-6; left -= STEP) {
      const h = Math.min(STEP, left)
      leanV += (S.stiffness * (target - lean) - 2 * S.damping * Math.sqrt(S.stiffness) * leanV) * h
      lean += leanV * h
      bumpV += (-B.stiffness * bumpY - 2 * B.damping * Math.sqrt(B.stiffness) * bumpV) * h
      bumpY += bumpV * h
    }
    const out = clamp(lean, 0, 1.08)
    wave = damp(wave, waveLeft > 0 && out > 0.6 ? 1 : 0, 7, dt)
    nod = damp(nod, 0, 2.2, dt)

    // Glances round the cab (only while inside).
    glanceIn -= dt
    if (glanceIn <= 0) {
      if (glanceGoal !== 0) {
        glanceGoal = 0
        glanceIn = rnd(DRIVER.glance.every)
      } else {
        glanceGoal = (Math.random() < 0.5 ? -1 : 1) * DRIVER.glance.yaw * (0.5 + Math.random() * 0.5)
        glanceIn = rnd(DRIVER.glance.hold)
      }
    }
    glance = damp(glance, out > 0.2 ? 0 : glanceGoal, 5, dt)

    // --- The pose ---------------------------------------------------------------------
    const P = DRIVER.pose
    const W = DRIVER.sway
    const pull = clamp(surgeS / 3, -1, 1) // + pulling away, - braking
    const speedK = clamp(speed / 20, 0, 1)
    const wind = out * speedK
    const roll = DRIVER.lean.roll * out // the waist bends out of the window, the chest further
    const roll2 = DRIVER.lean.roll2 * out
    pose.reset()
    addDef(P.driveR, 1)
    addDef(P.driveL, 1 - out)
    addDef(P.sill, out * (1 - wave))
    addDef(P.wave, wave)
    pose.add('ArmR1', pull * P.throttle) // regulator: pulled back to go, pushed to brake
    if (wave > 0.01) pose.add('ArmL1', 0, 0, Math.sin(elapsed * 9) * 0.38 * wave)
    const breath = Math.sin(elapsed * 2.1)
    pose.add('Spine1', -W.accel * Math.max(0, pull) + W.brake * Math.max(0, -pull) - bumpY * 3, 0, clamp(lateral / 8, -1, 1) * W.curve * (1 - out) - roll)
    pose.add('Spine2', breath * 0.015, 0, -roll2)
    pose.add('Neck1',
      0.2 * wind + nod * 0.35 * Math.sin(Math.min(1, (1 - nod) * 3) * Math.PI) + wind * Math.sin(elapsed * 27 + 1) * 0.04 + bumpY * 4,
      glance + wave * 0.5 + wind * Math.sin(elapsed * 19) * 0.06,
      (roll + roll2) * DRIVER.lean.level,
    )
    // An emote replaces the driving pose: the tracked bones blend over a neutral one.
    if (pendingEmote && emote) {
      emote.play(pendingEmote.clip, pendingEmote.onEnd)
      pendingEmote = null
    }
    if (emote?.active) {
      leanLeft = 0
      pose.reset()
      rig?.applyPose(pose)
      emote.apply(dt)
    } else rig?.applyPose(pose)

    // Placement: inside, the head sits on the window's centre line. Leaning out, the hips
    // slide to just inside the wall and rise to the sill, so the torso bends out over
    // it and only head, shoulders and the window arm leave the cab.
    const L = DRIVER.lean
    const slide = cab.wall - L.hipInset - cab.x
    const rise = hipToHead - cab.win.h / 2 + L.sillLift
    seat.position.set(cab.x, cab.y - headY - 0.02, cab.z)
    body.position.set(slide * lean, rise * lean + bumpY + Math.sin(elapsed * 57) * W.vibrate * speedK, 0)

    // The firebox flickers (and roars brighter when working); screens hum steady.
    const g = cab.glow?.material
    if (g) {
      g.emissiveIntensity =
        kind === 'steam'
          ? 1.9 + 0.5 * Math.sin(elapsed * 13.1) * Math.sin(elapsed * 7.3 + 1) + 0.3 * Math.sin(elapsed * 31) + 0.8 * Math.max(0, pull)
          : 2.1 + 0.08 * Math.sin(elapsed * 50)
    }
  }

  const api = {
    update,
    bump,
    leanOut,
    motion,
    setLook,
    playEmote,
    stopEmote: () => emote?.stop(),
    get emoting() {
      return !!emote?.active || !!pendingEmote
    },
    dispose,
    get loaded() {
      return !!root
    },
    get kind() {
      return kind
    },
    get out() {
      return clamp(lean, 0, 1)
    },
  }
  seat.userData.api = api // dev: scene.getObjectByName('driver').userData.api
  return api
}
