import { AdditiveBlending, CanvasTexture, Group, Mesh, MeshBasicMaterial, PlaneGeometry, Sprite, SpriteMaterial, SRGBColorSpace, Vector3 } from 'three'
import { DISPLAY, PLAYER_TRAIN, SHOP } from './config.js'
import { blk, lego } from './lego.js'
import { createEmitter, removeEmitter } from './particles.js'
import { paintSoftDot } from './textures.js'
import { buildTrain } from './trains.js'
import { buyTrain, equipTrain, onState, ownsTrain, SHOP_TRAINS, shortNumber, state } from './game.js'
import { createPrompt } from './prompt.js'

// The train shop on the west display. hubProps builds the tiers, plinths, models and
// labels (baked); this adds the live part of each slot - the plinth top coloured by
// state (SHOP.pad: owned / equipped / locked) and the rarity aura (glow + sparkles) -
// and the interaction: near a train a hold prompt shows "Train N" / "Buy 25 Wins"
// (or Equip / Equipped); holding E, or a finger on the prompt, for SHOP.holdTime buys
// it with wins and equips it. The equipped train is the one the player drives: the
// model is swapped on equip (mountPlayerTrain).
//   buildShop(scene, camera, slots, hud) -> { update(dt, playerFeet) }

let dotTex = null
function softDot() {
  if (!dotTex) {
    dotTex = new CanvasTexture(paintSoftDot(128))
    dotTex.colorSpace = SRGBColorSpace
  }
  return dotTex
}

const trainName = (i) => `Train ${i + 1}`

function buildSlot(scene, slot) {
  const D = DISPLAY
  const g = new Group()
  g.position.set(slot.x, slot.top, slot.z)
  g.rotation.y = slot.yaw
  scene.add(g)
  const mat = lego(SHOP.pad.locked).clone() // own copy: its colour follows the state
  const top = blk(g, mat, D.padW - 0.3, D.padTop - 0.22, D.padL - 0.3, 0, 0.22, 0)
  top.castShadow = false
  const aura = slot.entry.aura
  if (aura) {
    const glow = new Mesh(
      new PlaneGeometry(D.padW + 1.6, D.padL + 1.4),
      new MeshBasicMaterial({ map: softDot(), color: aura, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false }),
    )
    glow.rotation.x = -Math.PI / 2
    glow.position.y = D.padTop + 0.03
    glow.renderOrder = 1
    g.add(glow)
    const s = DISPLAY.trainScale
    // The haze round the body (a camera-facing soft glow, like the reference's aura).
    const halo = new Sprite(new SpriteMaterial({ map: softDot(), color: aura, transparent: true, opacity: 0.6, blending: AdditiveBlending, depthWrite: false }))
    halo.scale.set(5.2 * s, 3.6 * s, 1)
    halo.position.y = D.padTop + 1.3 * s
    halo.renderOrder = 2
    g.add(halo)
    // Sparkles twinkling up round the body, and a few soft wisps rising off it.
    createEmitter(scene, {
      parent: g,
      boxes: [{ x: 0, y: D.padTop + 1.3 * s, z: 0, sx: 1.0 * s, sy: 0.9 * s, sz: 2.3 * s }],
      count: 26,
      life: 2.2,
      velocity: [0, 0.8, 0],
      spread: [0.25, 0.3, 0.25],
      size: 0.32,
      grow: 0.6,
      color: aura,
      intensity: 1.8,
      sprite: 'sparkle',
      twinkle: 7,
      seed: 101 + slot.index,
    })
    createEmitter(scene, {
      parent: g,
      boxes: [{ x: 0, y: D.padTop + 0.5, z: 0, sx: 1.1 * s, sy: 0.2, sz: 2.4 * s }],
      count: 22,
      life: 1.8,
      velocity: [0, 1.4, 0],
      spread: [0.25, 0.35, 0.25],
      size: 1.3,
      grow: 1.8,
      color: aura,
      intensity: 1.1,
      opacity: 0.45,
      seed: 201 + slot.index,
    })
  }
  return mat
}

// The equipped train's model inside `holder` (main.js turns, pitches and bobs the holder;
// its userData mirrors the model's wheels / smoke point / length), with chimney smoke on
// steam engines. Swaps the model whenever another train is equipped.
export function mountPlayerTrain(scene, holder) {
  let model = null
  let smoke = null
  let mounted = -1
  onState(() => {
    if (state.train === mounted) return
    mounted = state.train
    if (smoke) removeEmitter(smoke)
    if (model) holder.remove(model)
    model = buildTrain(SHOP_TRAINS[mounted]?.train ?? PLAYER_TRAIN)
    holder.add(model)
    holder.userData.wheels = model.userData.wheels // spinWheels(holder) rolls the model's wheels
    holder.userData.length = model.userData.length
    holder.userData.smoke = model.userData.smoke
    const at = model.userData.smoke
    smoke = at
      ? createEmitter(scene, {
          parent: model,
          boxes: [{ x: at.x, y: at.y, z: at.z, sx: 0.08, sy: 0.05, sz: 0.08 }],
          count: 36,
          life: 1.5,
          velocity: [0, 2.1, -0.7],
          spread: [0.35, 0.4, 0.35],
          gravity: -0.4,
          size: 0.5,
          grow: 2.6,
          color: PLAYER_TRAIN.smoke,
          intensity: 0.75,
          opacity: 0.32,
          seed: 11,
        })
      : null
  })
}

export function buildShop(scene, camera, slots, hud) {
  const mats = slots.map((slot) => buildSlot(scene, slot))
  const paint = () => {
    slots.forEach((slot, i) => {
      const color = state.train === slot.index ? SHOP.pad.equipped : ownsTrain(slot.index) ? SHOP.pad.owned : SHOP.pad.locked
      mats[i].color.set(color)
    })
  }
  let shownTrain = -1
  let shownOwned = -1
  onState(() => {
    if (state.train === shownTrain && state.trainsOwned.length === shownOwned) return
    shownTrain = state.train
    shownOwned = state.trainsOwned.length
    paint()
  })

  // E held (keyboard). The prompt itself is the touch / mouse path.
  let keyDown = false
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyE' || e.repeat || e.target instanceof HTMLInputElement) return
    keyDown = true
  })
  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyE') keyDown = false
  })
  window.addEventListener('blur', () => (keyDown = false))

  const prompt = createPrompt(hud.root)
  const screen = new Vector3()
  let target = null
  let progress = 0
  let needRelease = false // after a completed hold the key must come up before the next one

  function complete(slot) {
    const i = slot.index
    const t = SHOP_TRAINS[i]
    if (ownsTrain(i)) {
      equipTrain(i)
      prompt.flash()
      hud.toast(`${trainName(i)} equipped!  +${shortNumber(t.power)} Power`)
      return
    }
    const r = buyTrain(i)
    if (r === 'ok') {
      prompt.flash()
      hud.toast(`${trainName(i)} unlocked!  +${shortNumber(t.power)} Power`)
    } else if (r === 'locked') {
      prompt.shake()
      let j = 0
      while (ownsTrain(j)) j++
      hud.toast(`Buy ${trainName(j)} first`)
    } else {
      prompt.shake()
      hud.toast(`You need ${shortNumber(t.wins)} Wins (you have ${shortNumber(state.wins)})`)
    }
  }

  return {
    update(dt, feet) {
      // Nearest plinth in reach (its own tier, or one up / down).
      let best = null
      let bestD = SHOP.range
      for (const slot of slots) {
        if (Math.abs(feet.y - slot.top) > SHOP.reachY) continue
        const d = Math.hypot(feet.x - slot.x, feet.z - slot.z)
        if (d < bestD) {
          bestD = d
          best = slot
        }
      }
      if (best !== target) {
        target = best
        progress = 0
      }
      if (!target) {
        prompt.hide()
        return
      }
      const i = target.index
      const equipped = state.train === i
      let lowerMissing = false
      for (let j = 0; j < i; j++) if (!ownsTrain(j)) lowerMissing = true
      const action = equipped ? 'Equipped' : ownsTrain(i) ? 'Equip' : lowerMissing ? 'Buy lower trains first' : `Buy ${shortNumber(SHOP_TRAINS[i].wins)} Wins`
      prompt.show(trainName(i), action, !equipped)

      // On screen over the train's body; hidden when it is behind the camera.
      screen.set(target.x, target.top + 1.5, target.z).project(camera)
      if (screen.z > 1) {
        prompt.hide()
        return
      }
      const w = window.innerWidth
      const h = window.innerHeight
      const x = Math.min(w - 130, Math.max(130, (screen.x * 0.5 + 0.5) * w))
      const y = Math.min(h - 60, Math.max(60, (-screen.y * 0.5 + 0.5) * h))
      prompt.place(x, y)

      const held = keyDown || prompt.pressed
      if (!held) needRelease = false
      if (held && !needRelease && !equipped) {
        progress += dt / SHOP.holdTime
        if (progress >= 1) {
          progress = 0
          needRelease = true
          complete(target)
        }
      } else progress = 0
      prompt.setProgress(progress)
    },
  }
}
