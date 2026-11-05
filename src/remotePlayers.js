// The other players in the room, drawn from the server's roster (net.players()):
// their equipped shop train (spinning wheels, chimney smoke), their railcars (Settings >
// "Other players' wagons"), a name tag like the local one, and their own Bloxity avatar in the
// cab, dressed with the look they sent (skin, hat, ... -> every player sees everyone's skin) and
// animated by the shared driver code (driver.js) from their speed: breathing, leaning out of the
// window, waving, plus Bloxity emotes when they play one (roster emote / emoteSeq).
//   const remotes = createRemotePlayers(scene, net, { onAction(entry, name) })
//   remotes.update(dt, elapsed, cameraPosition)
//   remotes.byUid(uid) -> { root, ... } | undefined      (chat bubbles)
//   remotes.count
// The roster is read every frame and diffed (no schema callbacks), so a joining / leaving /
// changing player is picked up whatever the SDK version.
import { Group, Vector3 } from 'three'
import { PLAYER_TRAIN, TRAINING } from './config.js'
import { buildTrain, spinWheels } from './trains.js'
import { createEmitter, removeEmitter } from './particles.js'
import { createWagons } from './wagons.js'
import { createDriver } from './driver.js'
import { sign } from './signs.js'
import { SHOP_TRAINS, state, titleById } from './game.js'
import * as bloxity from './bloxity.js'

const CULL = 140 // m from the camera: further players are hidden
const NEAR = 70 // m: the driver (and its emotes) only animate this close
const damp = (cur, goal, rate, dt) => cur + (goal - cur) * (1 - Math.exp(-rate * dt))
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))

function parseLook(json) {
  try {
    const l = JSON.parse(json)
    return l && typeof l === 'object' ? { equipped: l.equipped ?? null, proportions: l.proportions ?? null, skin: l.skin || '' } : null
  } catch {
    return null
  }
}

export function createRemotePlayers(scene, net, { onAction } = {}) {
  const entries = new Map() // sessionId -> entry
  let emotes = new Map()
  bloxity.loadEmotes().then((m) => (emotes = m))
  let firstSync = true
  const tmp = new Vector3()

  function tagLines(p) {
    const t = p.title ? titleById(p.title) : null
    return [
      ...(t ? [{ text: t.name, color: t.color, size: 0.62 }] : []),
      { text: `@${p.username || 'Player'}`, color: '#ffffff', size: 0.62 },
      { text: `Level ${p.level || 1}`, color: ['#ffe86a', '#ffb51a'], size: 0.7 },
    ]
  }

  function create(sid, p, announce) {
    const root = new Group()
    root.visible = false
    scene.add(root)
    const holder = new Group() // turned like the local `train` holder
    root.add(holder)
    const src = { velocity: { x: 0, z: 0 }, facing: p.yaw, grounded: true, training: false, autoRun: false }
    const driver = createDriver(holder, { source: src, look: {} })
    const tag = sign(tagLines(p), 0.55, { depthTest: false, renderOrder: 10, outline: 10 })
    tag.position.y = 3.3
    root.add(tag)
    const wagons = createWagons(scene)
    const e = {
      sid, uid: p.uid, root, holder, driver, tag, wagons, src,
      model: null, smoke: null, trainIdx: -1,
      pos: new Vector3(p.x, p.y, p.z), yaw: p.yaw, seen: false,
      tagKey: '', avatar: null, emoteSeq: p.emoteSeq, actionSeq: p.actionSeq, wagonKey: '',
      lastX: p.x, lastZ: p.z,
    }
    entries.set(sid, e)
    if (p.username) (announce ? bloxity.playerJoined : bloxity.playerInRoom)(p.username)
    return e
  }

  function mountTrain(e, idx) {
    e.trainIdx = idx
    if (e.smoke) removeEmitter(e.smoke)
    if (e.model) e.holder.remove(e.model)
    const model = buildTrain(SHOP_TRAINS[idx]?.train ?? PLAYER_TRAIN)
    e.model = model
    e.holder.add(model)
    e.holder.userData.wheels = model.userData.wheels
    e.holder.userData.length = model.userData.length
    const at = model.userData.smoke
    e.smoke = at
      ? createEmitter(scene, {
          parent: model,
          boxes: [{ x: at.x, y: at.y, z: at.z, sx: 0.08, sy: 0.05, sz: 0.08 }],
          count: 24,
          life: 1.5,
          velocity: [0, 2.1, -0.7],
          spread: [0.35, 0.4, 0.35],
          gravity: -0.4,
          size: 0.5,
          grow: 2.6,
          color: PLAYER_TRAIN.smoke,
          intensity: 0.75,
          opacity: 0.32,
          seed: 11 + (idx % 7),
        })
      : null
  }

  function dispose(e) {
    if (e.smoke) removeEmitter(e.smoke)
    e.driver.dispose()
    scene.remove(e.root)
    scene.remove(e.wagons.root)
    e.tag.material.map?.dispose()
    e.tag.material.dispose()
  }

  function update(dt, elapsed, camPos) {
    const roster = net.players()
    // --- Diff the roster ---------------------------------------------------------
    if (roster) {
      const live = new Set()
      roster.forEach((p, sid) => {
        if (sid === net.sessionId) return
        live.add(sid)
        if (!entries.has(sid)) create(sid, p, !firstSync)
      })
      for (const [sid, e] of entries) {
        if (live.has(sid)) continue
        dispose(e)
        entries.delete(sid)
      }
      firstSync = false
    } else if (entries.size) {
      for (const e of entries.values()) dispose(e)
      entries.clear()
      firstSync = true
    }
    if (!roster) return

    const showWagons = state.settings.wagons !== false
    for (const [sid, e] of entries) {
      const p = roster.get(sid)
      if (!p) continue
      e.uid = p.uid
      if (p.train !== e.trainIdx || !e.model) mountTrain(e, p.train)

      // Smoothed motion towards the last pose (snaps after a teleport / first pose).
      const far = Math.hypot(p.x - e.pos.x, p.z - e.pos.z) > 18 || Math.abs(p.y - e.pos.y) > 18
      if (far || !e.seen) {
        e.pos.set(p.x, p.y, p.z)
        e.yaw = p.yaw
        e.lastX = p.x
        e.lastZ = p.z
        e.seen = true
      } else {
        const k = 1 - Math.exp(-14 * dt)
        e.pos.x += (p.x - e.pos.x) * k
        e.pos.y += (p.y - e.pos.y) * k
        e.pos.z += (p.z - e.pos.z) * k
        e.yaw += wrap(p.yaw - e.yaw) * k
      }
      e.root.position.copy(e.pos)
      e.holder.rotation.y = e.yaw

      // Cull by distance.
      const dist = tmp.copy(e.pos).sub(camPos).length()
      const visible = dist < CULL
      e.root.visible = visible
      e.wagons.root.visible = visible && showWagons
      if (!visible) {
        e.lastX = e.pos.x
        e.lastZ = e.pos.z
        continue
      }

      const moved = Math.hypot(e.pos.x - e.lastX, e.pos.z - e.lastZ)
      e.lastX = e.pos.x
      e.lastZ = e.pos.z
      spinWheels(e.holder, p.training ? TRAINING.wheelSpeed * dt : moved)

      // Name tag.
      const key = `${p.username}|${p.title}|${p.level}`
      if (key !== e.tagKey) {
        e.tagKey = key
        e.tag.setLines(tagLines(p))
      }

      // Railcars.
      if (showWagons) {
        const types = p.railcars ? p.railcars.split(',').filter(Boolean) : []
        e.wagons.set(types, e.pos.x, e.pos.y, e.pos.z, e.yaw)
        e.wagons.update(e.pos.x, e.pos.y, e.pos.z, e.yaw, (e.holder.userData.length ?? 4.2) / 2 - 0.25)
      }

      // The driver: their Bloxity look, driven by their speed.
      if (p.avatar !== e.avatar) {
        e.avatar = p.avatar
        const look = p.avatar ? parseLook(p.avatar) : null
        if (look) e.driver.setLook(look)
      }
      if (p.emoteSeq !== e.emoteSeq) {
        e.emoteSeq = p.emoteSeq
        if (p.emote) {
          const clip = emotes.get(p.emote)
          if (clip) e.driver.playEmote(clip)
        } else e.driver.stopEmote()
      }
      if (p.actionSeq !== e.actionSeq) {
        e.actionSeq = p.actionSeq
        if (p.action) {
          if (p.action === 'horn' || p.action === 'wave') e.driver.leanOut(2.4, true)
          onAction?.(e, p.action)
        }
      }
      e.src.velocity.x = p.training ? 0 : Math.min(p.speed, 60)
      e.src.facing = e.yaw
      e.src.training = !!p.training
      if (dist < NEAR) e.driver.update(dt, elapsed)
    }
  }

  return {
    update,
    get count() {
      return entries.size
    },
    list: () => [...entries.values()],
    byUid(uid) {
      if (!uid) return undefined
      for (const e of entries.values()) if (e.uid === uid) return e
      return undefined
    },
  }
}
